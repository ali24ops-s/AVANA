import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Sparkles,
  BookOpen,
  Layers,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { createApiClient, getApiBaseUrl } from "../../lib/api/client.js";
import { createReviewApi } from "../../lib/api/review.js";
import { ContentReviewDetail } from "./ContentReviewDetail.js";
import type { ReviewQueueResource, GeneratedContentType } from "@avana/contracts";

export interface ReviewQueueListProps {
  organizationId: string;
  courseId: string;
}

export function ReviewQueueList({
  organizationId,
  courseId,
}: ReviewQueueListProps) {
  const [activeContentId, setActiveContentId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<GeneratedContentType | "all">("all");
  const [page, setPage] = useState(1);

  const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
  const reviewApi = createReviewApi(apiClient);

  const queueQuery = useQuery({
    queryKey: ["review-queue", organizationId, courseId, typeFilter, page],
    queryFn: () =>
      reviewApi.getReviewQueue(organizationId, courseId, {
        page,
        limit: 20,
        type: typeFilter !== "all" ? typeFilter : undefined,
      }),
    refetchInterval: 5000,
    placeholderData: (previousData) => previousData,
  });

  if (activeContentId) {
    return (
      <ContentReviewDetail
        organizationId={organizationId}
        courseId={courseId}
        contentId={activeContentId}
        onBack={() => setActiveContentId(null)}
      />
    );
  }

  if (queueQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-[#008080]" />
      </div>
    );
  }

  if (queueQuery.isError) {
    return (
      <div className="bg-[var(--color-surface)] rounded-3xl border border-[var(--color-border)] p-12 text-center space-y-4">
        <AlertCircle className="w-10 h-10 text-red-500 mx-auto" />
        <h3 className="text-base font-bold text-[var(--color-text)]">
          خطا در بارگذاری صف بازبینی
        </h3>
        <p className="text-xs text-[var(--color-text-muted)]">
          {queueQuery.error?.message || "خطایی در دریافت اطلاعات رخ داد."}
        </p>
        <button
          type="button"
          onClick={() => void queueQuery.refetch()}
          className="px-4 py-2 bg-[#008080] hover:bg-[#006666] text-white rounded-xl text-xs font-bold"
        >
          تلاش مجدد
        </button>
      </div>
    );
  }

  const items = queueQuery.data?.pending ?? [];
  const filtered =
    typeFilter === "all"
      ? items
      : items.filter((item) => item.type === typeFilter);

  const typeIcon = (type: string) => {
    switch (type) {
      case "lesson":
        return <BookOpen className="w-4 h-4 text-blue-600" />;
      case "flashcard":
        return <Layers className="w-4 h-4 text-amber-600" />;
      case "quiz":
        return <HelpCircle className="w-4 h-4 text-purple-600" />;
      default:
        return <Sparkles className="w-4 h-4 text-[#008080]" />;
    }
  };

  const getFilterLabel = (t: string) => {
    switch (t) {
      case "all":
        return "همه";
      case "lesson":
        return "درس‌ها";
      case "flashcard":
        return "فلش‌کارت‌ها";
      case "quiz":
        return "آزمون‌ها";
      default:
        return t;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Filter Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-[var(--color-text)]">
            صف بازبینی و تایید محتوا
          </h3>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
            پیش‌نویس‌های تولیدشده را همراه با ارجاعات منبع بررسی، ویرایش یا تایید نمایید.
          </p>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 p-1 bg-[var(--color-surface-warm)] border-2 border-[var(--color-border)] rounded-xl text-xs">
          {(["all", "lesson", "flashcard", "quiz"] as const).map((t) => (
            <button
              type="button"
              key={t}
              onClick={() => {
                setTypeFilter(t);
                setPage(1);
              }}
              aria-pressed={typeFilter === t}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                typeFilter === t
                  ? "bg-[#007a7a] text-white shadow-sm"
                  : "text-[var(--color-text)] hover:bg-[var(--color-surface)] border border-transparent hover:border-[var(--color-border)]"
              }`}
            >
              {getFilterLabel(t)}
            </button>
          ))}
        </div>
      </div>

      {/* Queue items list */}
      {filtered.length === 0 ? (
        <div className="bg-[var(--color-surface)] rounded-3xl border border-[var(--color-border)] p-12 text-center space-y-3">
          <Sparkles className="w-10 h-10 text-[var(--color-text-muted)] mx-auto" />
          <h4 className="text-sm font-bold text-[var(--color-text)]">
            موردی در انتظار بازبینی وجود ندارد
          </h4>
          <p className="text-xs text-[var(--color-text-muted)] max-w-sm mx-auto leading-relaxed">
            {typeFilter === "all"
              ? "تمامی پیش‌نویس‌های تولیدشده بازبینی و تایید شده‌اند یا سندی پردازش نشده است."
              : `پیش‌نویسی از نوع ${getFilterLabel(typeFilter)} در صف انتظار نیست.`}
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map((item: ReviewQueueResource) => (
            <button
              type="button"
              key={item.id}
              onClick={() => setActiveContentId(item.id)}
              aria-label={`بازبینی پیش‌نویس ${item.type}: ${item.title}`}
              className="w-full text-right group bg-[var(--color-surface)] hover:bg-[var(--color-surface-warm)] rounded-2xl border border-[var(--color-border)] hover:border-[#008080] p-4 transition-all cursor-pointer flex items-center justify-between gap-4 focus:outline-none focus:ring-2 focus:ring-[#008080]"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                  {typeIcon(item.type)}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[#008080]/10 text-[#008080]">
                      {item.type === "lesson" ? "درس" : item.type === "flashcard" ? "فلش‌کارت" : "آزمون"}
                    </span>
                    <span className="text-xs text-[var(--color-text-muted)]">
                      {new Date(item.updated_at).toLocaleDateString("fa-IR")}
                    </span>
                  </div>
                  <h4 className="text-sm font-bold text-[var(--color-text)] truncate mt-1 group-hover:text-[#008080] transition-colors">
                    {item.title}
                  </h4>
                </div>
              </div>

              <div className="flex items-center gap-1 text-xs font-bold text-[#008080] flex-shrink-0 group-hover:-translate-x-0.5 transition-transform">
                <span>بازبینی پیش‌نویس</span>
                <ChevronLeft className="w-4 h-4" />
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Pagination footer */}
      {(() => {
        const totalPages =
          (queueQuery.data?.pagination as any)?.total_pages ??
          (queueQuery.data?.pagination as any)?.totalPages ??
          1;
        const total = (queueQuery.data?.pagination as any)?.total ?? items.length;
        if (totalPages <= 1) return null;
        return (
          <div className="flex items-center justify-between pt-4 border-t border-[var(--color-border)]">
            <span className="text-xs text-[var(--color-text-muted)]">
              مجموع: {total} مورد (صفحه {page} از {totalPages})
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="p-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-text)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--color-surface-warm)]"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="p-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-text)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--color-surface-warm)]"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
