import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  Search,
  X,
} from "lucide-react";
import { createApiClient, getApiBaseUrl } from "../../lib/api/client.js";
import { createReviewApi } from "../../lib/api/review.js";
import { ContentReviewDetail } from "./ContentReviewDetail.js";
import { ReviewDocumentGroup } from "./ReviewDocumentGroup.js";
import type {
  ReviewQueueResource,
  ReviewDocumentGroupResource,
  GeneratedContentType,
} from "@avana/contracts";

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
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
  const reviewApi = createReviewApi(apiClient);

  const bulkApproveMutation = useMutation({
    mutationFn: (documentId: string) =>
      reviewApi.acceptAllInDocument(organizationId, courseId, documentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["review-queue", organizationId, courseId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["official-review-workspace", courseId],
      });
    },
  });

  const queueQuery = useQuery({
    queryKey: [
      "review-queue",
      organizationId,
      courseId,
      typeFilter,
      searchQuery,
      page,
    ],
    queryFn: () =>
      reviewApi.getReviewQueue(organizationId, courseId, {
        page,
        limit: 20,
        type: typeFilter !== "all" ? typeFilter : undefined,
        search: searchQuery.trim() || undefined,
      }),
    refetchInterval: 5000,
    placeholderData: (previousData) => previousData,
  });

  // Backward compatibility fallback: derive groups from flat pending list if groups field is not provided
  const groups: ReviewDocumentGroupResource[] = useMemo(() => {
    let rawGroups: ReviewDocumentGroupResource[] = [];

    if (queueQuery.data?.groups && Array.isArray(queueQuery.data.groups)) {
      rawGroups = queueQuery.data.groups;
    } else {
      const pending = queueQuery.data?.pending ?? [];
      if (pending.length === 0) return [];

      const map = new Map<string, ReviewQueueResource[]>();
      for (const item of pending) {
        const docId = item.document_id || "__unknown__";
        const existing = map.get(docId);
        if (existing) {
          existing.push(item);
        } else {
          map.set(docId, [item]);
        }
      }

      rawGroups = Array.from(map.entries()).map(([docId, items]) => {
        const isUnknown = docId === "__unknown__";
        return {
          document: isUnknown
            ? null
            : {
                id: docId,
                filename: items[0]?.title ? `سند ${docId.slice(0, 8)}` : null,
                title: null,
              },
          stats: {
            total: items.length,
            pending: items.filter(
              (i) => i.status !== "accepted" && i.status !== "rejected",
            ).length,
            approved: items.filter((i) => i.status === "accepted").length,
            rejected: items.filter((i) => i.status === "rejected").length,
            needsRevision: items.filter((i) => i.status === "edited").length,
          },
          items,
        };
      });
    }

    // Client-side filtering on group items (preserves full stats)
    if (typeFilter === "all" && !searchQuery) {
      return rawGroups;
    }

    const q = searchQuery.trim().toLowerCase();
    return rawGroups
      .map((g) => {
        const docMatches = g.document?.filename?.toLowerCase().includes(q);
        const filteredItems = g.items.filter((item) => {
          if (typeFilter !== "all" && item.type !== typeFilter) {
            return false;
          }
          if (q && !docMatches && !item.title.toLowerCase().includes(q)) {
            return false;
          }
          return true;
        });

        return {
          ...g,
          items: filteredItems,
        };
      })
      .filter((g) => g.items.length > 0);
  }, [queueQuery.data, typeFilter, searchQuery]);

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
      {/* Header & Controls Bar */}
      <div className="space-y-4">
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
          <div className="flex items-center gap-1.5 p-1 bg-[var(--color-surface-warm)] border-2 border-[var(--color-border)] rounded-xl text-xs overflow-x-auto">
            {(["all", "lesson", "flashcard", "quiz"] as const).map((t) => (
              <button
                type="button"
                key={t}
                onClick={() => {
                  setTypeFilter(t);
                  setPage(1);
                }}
                aria-pressed={typeFilter === t}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all whitespace-nowrap ${
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

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
            placeholder="جستجو در نام فایل‌ها و عناوین محتوا..."
            className="w-full pr-10 pl-10 py-2.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl text-xs text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[#008080] focus:border-transparent transition-all"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setPage(1);
              }}
              className="absolute left-3 top-1/2 -translate-y-1/2 p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text)] rounded-md"
              aria-label="پاک کردن جستجو"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Grouped Queue Items */}
      {groups.length === 0 ? (
        <div className="bg-[var(--color-surface)] rounded-3xl border border-[var(--color-border)] p-12 text-center space-y-3">
          <Sparkles className="w-10 h-10 text-[var(--color-text-muted)] mx-auto" />
          <h4 className="text-sm font-bold text-[var(--color-text)]">
            موردی در انتظار بازبینی وجود ندارد
          </h4>
          <p className="text-xs text-[var(--color-text-muted)] max-w-sm mx-auto leading-relaxed">
            {searchQuery
              ? `هیچ نتیجه‌ای برای عبارت «${searchQuery}» پیدا نشد.`
              : typeFilter === "all"
              ? "تمامی پیش‌نویس‌های تولیدشده بازبینی و تایید شده‌اند یا سندی پردازش نشده است."
              : `پیش‌نویسی از نوع ${getFilterLabel(typeFilter)} در صف انتظار نیست.`}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((group, index) => {
            const groupId = group.document?.id ?? `unknown-group-${index}`;
            const isOpen = expandedGroupId === groupId;
            return (
              <ReviewDocumentGroup
                key={groupId}
                group={group}
                isOpen={isOpen}
                onToggle={() =>
                  setExpandedGroupId((prev) => (prev === groupId ? null : groupId))
                }
                onSelectItem={(contentId) => setActiveContentId(contentId)}
                onApproveAll={
                  group.document?.id
                    ? async (docId) => {
                        await bulkApproveMutation.mutateAsync(docId);
                      }
                    : undefined
                }
                isApprovingAll={
                  bulkApproveMutation.isPending &&
                  bulkApproveMutation.variables === group.document?.id
                }
              />
            );
          })}
        </div>
      )}

      {/* Pagination footer */}
      {(() => {
        type PaginationShape = {
          total_pages?: number;
          totalPages?: number;
          total?: number;
        };
        const pag = queueQuery.data?.pagination as PaginationShape | undefined;
        const totalPages = pag?.total_pages ?? pag?.totalPages ?? 1;
        const total = pag?.total ?? groups.length;
        if (totalPages <= 1) return null;
        return (
          <div className="flex items-center justify-between pt-4 border-t border-[var(--color-border)]">
            <span className="text-xs text-[var(--color-text-muted)]">
              مجموع: {total} فایل/گروه (صفحه {page} از {totalPages})
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="p-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-text)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--color-surface-warm)]"
                aria-label="صفحه قبلی"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="p-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-text)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--color-surface-warm)]"
                aria-label="صفحه بعدی"
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
