import React, { useEffect, useState, useMemo, useCallback } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { Plus, Search, Copy, Check, Trash2, Image as ImageIcon } from "lucide-react";
import { createApiClient, getApiBaseUrl } from "../../lib/api/client.js";
import {
  createStudioApi,
  type MarketingQuiz,
  type MarketingQuizStatus,
} from "../../lib/api/studio-api.js";
import {
  LoadingState,
  Button,
  Dialog,
  DialogHeader,
  DialogContent,
  DialogFooter,
} from "../../components/ui/index.js";
import { useAuth } from "../../providers/AuthProvider.js";

export function StudioQuizzesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [quizzes, setQuizzes] = useState<MarketingQuiz[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"all" | MarketingQuizStatus>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  // New Quiz Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(
    searchParams.get("new") === "true",
  );
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newCoverUrl, setNewCoverUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const isContentWorker = user?.role === "content_worker";

  const studioApi = useMemo(() => {
    const client = createApiClient({ baseUrl: getApiBaseUrl() });
    return createStudioApi(client);
  }, []);

  const loadQuizzes = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await studioApi.listQuizzes();
      setQuizzes(res.quizzes || []);
    } catch (err) {
      console.error("Error fetching quizzes", err);
    } finally {
      setIsLoading(false);
    }
  }, [studioApi]);

  useEffect(() => {
    loadQuizzes();
  }, [loadQuizzes]);

  const filteredQuizzes = useMemo(() => {
    return quizzes.filter((q) => {
      const matchStatus = activeTab === "all" || q.status === activeTab;
      const matchSearch =
        searchQuery.trim() === "" ||
        q.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        q.description?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchStatus && matchSearch;
    });
  }, [quizzes, activeTab, searchQuery]);

  const handleCopyLink = (slug: string) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}/quiz/${slug}`;
    void navigator.clipboard.writeText(url);
    setCopiedSlug(slug);
    setTimeout(() => setCopiedSlug(null), 2500);
  };

  const handleStatusChange = async (quiz: MarketingQuiz, newStatus: MarketingQuizStatus) => {
    try {
      await studioApi.updateQuiz(quiz.id, { status: newStatus });
      await loadQuizzes();
    } catch (err) {
      alert(err instanceof Error ? err.message : "خطا در تغییر وضعیت آزمون");
    }
  };

  const handleDelete = async (quizId: string) => {
    if (!window.confirm("آیا از حذف این آزمون مطمئن هستید؟")) return;
    try {
      await studioApi.deleteQuiz(quizId);
      await loadQuizzes();
    } catch (err) {
      alert(err instanceof Error ? err.message : "خطا در حذف آزمون");
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) {
      setFormError("عنوان آزمون الزامی است.");
      return;
    }
    try {
      setIsSubmitting(true);
      setFormError(null);
      const res = await studioApi.createQuiz({
        title: newTitle.trim(),
        description: newDescription.trim() || undefined,
        coverImageUrl: newCoverUrl.trim() || undefined,
      });
      setIsCreateModalOpen(false);
      setNewTitle("");
      setNewDescription("");
      setNewCoverUrl("");
      searchParams.delete("new");
      setSearchParams(searchParams);
      if (res.quiz?.id) {
        navigate(`/studio/quizzes/${res.quiz.id}/edit`);
        return;
      }
      await loadQuizzes();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "خطا در ایجاد آزمون");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[var(--color-text)]">
            آزمون‌های بازاریابی
          </h1>
          <p className="text-xs sm:text-sm text-[var(--color-text-muted)] mt-1">
            تعریف، طراحی، ویرایش و مدیریت آزمون‌های اختصاصی کمپین‌های جذب مخاطب
          </p>
        </div>
        <Button
          variant="primary"
          size="md"
          onClick={() => setIsCreateModalOpen(true)}
          leftIcon={<Plus className="w-4 h-4" />}
          className="self-start sm:self-auto"
        >
          آزمون جدید
        </Button>
      </div>

      {/* Tabs & Search Filter */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 border-b border-[var(--color-border)] pb-4">
        <div className="flex items-center gap-1.5 p-1 bg-[var(--color-surface-warm)] rounded-[12px] border border-[var(--color-border)] overflow-x-auto min-w-0">
          {[
            { id: "all", label: "همه" },
            { id: "published", label: "منتشرشده" },
            { id: "draft", label: "پیش‌نویس" },
            { id: "disabled", label: "غیرفعال" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`px-3.5 py-1.5 text-xs sm:text-sm font-semibold rounded-[8px] transition-all whitespace-nowrap cursor-pointer ${
                activeTab === tab.id
                  ? "bg-[var(--color-surface)] text-[var(--color-text)] shadow-xs"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <input
            type="text"
            placeholder="جستجو در عنوان یا توضیحات..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full text-xs sm:text-sm pe-9 ps-3.5 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[10px] focus:outline-none focus:border-[#008080] focus:ring-2 focus:ring-[#008080]/15 text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] transition-all"
          />
          <Search className="w-4 h-4 text-[var(--color-text-muted)] absolute end-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
      </div>

      {/* Quizzes List */}
      {isLoading ? (
        <div className="py-12 flex justify-center">
          <LoadingState message="در حال دریافت فهرست آزمون‌ها..." />
        </div>
      ) : filteredQuizzes.length === 0 ? (
        <div className="text-center py-12 bg-[var(--color-surface)] border border-dashed border-[var(--color-border)] rounded-[16px]">
          <p className="text-sm text-[var(--color-text-muted)]">
            هیچ آزمونی با این مشخصات یافت نشد.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredQuizzes.map((quiz) => (
            <div
              key={quiz.id}
              className="bg-[var(--color-surface)] rounded-[16px] border border-[var(--color-border)] flex flex-col overflow-hidden hover:border-[var(--color-primary-default)]/40 hover:shadow-card transition-all shadow-xs"
            >
              {/* Cover or placeholder header */}
              {quiz.coverImageUrl ? (
                <img
                  src={quiz.coverImageUrl}
                  alt={quiz.title}
                  className="w-full h-36 object-cover bg-[var(--color-surface-warm)]"
                />
              ) : (
                <div className="w-full h-28 bg-[var(--color-surface-warm)] border-b border-[var(--color-border)] flex items-center justify-center text-xs text-[var(--color-text-muted)] gap-2">
                  <ImageIcon className="w-4 h-4 text-[var(--color-text-muted)]" />
                  <span>بدون تصویر کاور</span>
                </div>
              )}

              {/* Card Body */}
              <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between space-y-4">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-xs font-medium text-[var(--color-text-muted)]">
                      {quiz.questionsCount ?? quiz.questions?.length ?? 0} سؤال
                    </span>
                    {quiz.status === "published" && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#e4f4ec] text-[#2a624b] border border-[#9ed4bb]">
                        منتشرشده
                      </span>
                    )}
                    {quiz.status === "draft" && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#fdf2e4] text-[#8f5e27] border border-[#e8c18a]">
                        پیش‌نویس
                      </span>
                    )}
                    {quiz.status === "disabled" && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[var(--color-surface-warm)] text-[var(--color-text-muted)] border border-[var(--color-border)]">
                        غیرفعال
                      </span>
                    )}
                  </div>

                  <Link to={`/studio/quizzes/${quiz.id}/edit`} className="block">
                    <h3 className="font-bold text-sm sm:text-base text-[var(--color-text)] hover:text-[var(--color-primary-default)] line-clamp-1 transition-colors">
                      {quiz.title}
                    </h3>
                  </Link>

                  {quiz.description && (
                    <p className="text-xs text-[var(--color-text-muted)] line-clamp-2 mt-1.5 leading-relaxed">
                      {quiz.description}
                    </p>
                  )}
                </div>

                {/* Actions & Public Link */}
                <div className="pt-3 border-t border-[var(--color-border)] flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {quiz.status === "published" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleCopyLink(quiz.slug)}
                        leftIcon={copiedSlug === quiz.slug ? <Check className="w-3.5 h-3.5 text-[#2a624b]" /> : <Copy className="w-3.5 h-3.5" />}
                      >
                        {copiedSlug === quiz.slug ? "کپی شد" : "لینک آزمون"}
                      </Button>
                    ) : (
                      <span className="text-[11px] text-[var(--color-text-muted)]">
                        لینک عمومی غیرفعال
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {!isContentWorker && (
                      <>
                        {quiz.status === "draft" && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleStatusChange(quiz, "published")}
                          >
                            انتشار
                          </Button>
                        )}
                        {quiz.status === "published" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleStatusChange(quiz, "disabled")}
                          >
                            غیرفعال‌سازی
                          </Button>
                        )}
                        {quiz.status === "disabled" && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleStatusChange(quiz, "published")}
                          >
                            فعال‌سازی
                          </Button>
                        )}
                      </>
                    )}
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => navigate(`/studio/quizzes/${quiz.id}/edit`)}
                    >
                      مدیریت
                    </Button>
                    {!isContentWorker && (
                      <button
                        type="button"
                        onClick={() => handleDelete(quiz.id)}
                        className="p-1.5 text-[var(--color-text-muted)] hover:text-[#b84c4c] hover:bg-[#fde8e8] rounded-lg transition-colors cursor-pointer"
                        title="حذف آزمون"
                        aria-label="حذف آزمون"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Quiz Modal with standard Dialog */}
      <Dialog
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        maxWidth="lg"
        isCompound
      >
        <DialogHeader onClose={() => setIsCreateModalOpen(false)}>
          <h3 className="font-bold text-base sm:text-lg text-[var(--color-text)]">
            ساخت آزمون بازاریابی جدید
          </h3>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">
            مشخصات اولیه آزمون را وارد کنید. پس از ساخت، سوالات و تنظیمات تکمیلی در ویرایشگر در دسترس خواهد بود.
          </p>
        </DialogHeader>

        <form onSubmit={handleCreateSubmit} className="flex flex-col flex-1 min-h-0">
          <DialogContent className="space-y-4">
            {formError && (
              <div className="p-3 text-xs bg-[#fde8e8] text-[#7f3131] rounded-[10px] border border-[#e8a0a0]">
                {formError}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-[var(--color-text)] mb-1.5">
                عنوان آزمون *
              </label>
              <input
                type="text"
                placeholder="مثلاً: آزمون تعیین سطح آنتی‌بیوتیک‌ها در فارماکولوژی"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="w-full text-xs sm:text-sm px-3.5 py-2.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[10px] focus:outline-none focus:border-[#008080] focus:ring-2 focus:ring-[#008080]/15 text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] transition-all"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--color-text)] mb-1.5">
                توضیحات و پیام ترغیب‌کننده
              </label>
              <textarea
                rows={3}
                placeholder="توضیح کوتاه درباره هدف آزمون، سطح دشواری و مخاطبان هدف..."
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                className="w-full text-xs sm:text-sm px-3.5 py-2.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[10px] focus:outline-none focus:border-[#008080] focus:ring-2 focus:ring-[#008080]/15 text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] resize-none transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--color-text)] mb-1.5">
                آدرس تصویر کاور (اختیاری)
              </label>
              <input
                type="url"
                placeholder="https://example.com/cover.jpg"
                value={newCoverUrl}
                onChange={(e) => setNewCoverUrl(e.target.value)}
                className="w-full text-xs sm:text-sm px-3.5 py-2.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[10px] focus:outline-none focus:border-[#008080] focus:ring-2 focus:ring-[#008080]/15 text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] text-left font-mono text-xs transition-all"
              />
            </div>
          </DialogContent>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsCreateModalOpen(false)}
            >
              انصراف
            </Button>
            <Button
              variant="primary"
              size="sm"
              type="submit"
              disabled={isSubmitting}
              isLoading={isSubmitting}
            >
              {isSubmitting ? "در حال ایجاد..." : "ایجاد و ورود به ویرایشگر"}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </div>
  );
}
