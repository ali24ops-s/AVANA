import { useState } from "react";
import {
  FileText,
  FileQuestion,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  BookOpen,
  Layers,
  HelpCircle,
  Sparkles,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import type {
  ReviewDocumentGroupResource,
  ReviewQueueResource,
  GeneratedContentType,
} from "@avana/contracts";

export interface ReviewDocumentGroupProps {
  group: ReviewDocumentGroupResource;
  onSelectItem: (contentId: string) => void;
  defaultExpanded?: boolean;
}

export function ReviewDocumentGroup({
  group,
  onSelectItem,
  defaultExpanded,
}: ReviewDocumentGroupProps) {
  // Default open if pending items or review items exist in group, otherwise collapsed
  const hasItemsToReview = group.items.length > 0 || group.stats.pending > 0;
  const [isOpen, setIsOpen] = useState(
    defaultExpanded !== undefined ? defaultExpanded : hasItemsToReview,
  );

  const doc = group.document;
  const filename = doc?.filename || doc?.title || "منبع نامشخص";
  const isUnknown = !doc;

  const typeIcon = (type: GeneratedContentType | string) => {
    switch (type) {
      case "lesson":
        return <BookOpen className="w-4 h-4 text-blue-500" />;
      case "flashcard":
        return <Layers className="w-4 h-4 text-amber-500" />;
      case "quiz":
        return <HelpCircle className="w-4 h-4 text-purple-500" />;
      case "review_summary":
        return <Sparkles className="w-4 h-4 text-teal-500" />;
      default:
        return <Sparkles className="w-4 h-4 text-[#008080]" />;
    }
  };

  const getTypeName = (type: GeneratedContentType | string) => {
    switch (type) {
      case "lesson":
        return "درس آموزشی";
      case "flashcard":
        return "فلش‌کارت";
      case "quiz":
        return "آزمون";
      case "review_summary":
        return "خلاصه مروری";
      default:
        return type;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "draft":
      case "pending_review":
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <Clock className="w-3 h-3" />
            <span>در انتظار بازبینی</span>
          </span>
        );
      case "edited":
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
            <AlertCircle className="w-3 h-3" />
            <span>ویرایش‌شده</span>
          </span>
        );
      case "accepted":
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3" />
            <span>تأیید شده</span>
          </span>
        );
      case "rejected":
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
            <XCircle className="w-3 h-3" />
            <span>رد شده</span>
          </span>
        );
      case "regenerating":
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 animate-pulse">
            <RefreshCw className="w-3 h-3 animate-spin" />
            <span>در حال بازتولید</span>
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] shadow-sm overflow-hidden transition-all duration-200">
      {/* Group Header Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        className="w-full text-right p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-[var(--color-surface-warm)]/60 transition-colors focus:outline-none focus:ring-2 focus:ring-[#008080] focus:ring-inset"
      >
        <div className="flex items-start sm:items-center gap-3.5 min-w-0">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border ${
              isUnknown
                ? "bg-amber-500/10 border-amber-500/20 text-amber-500"
                : "bg-teal-500/10 border-teal-500/20 text-teal-600 dark:text-teal-400"
            }`}
          >
            {isUnknown ? (
              <FileQuestion className="w-5 h-5" />
            ) : (
              <FileText className="w-5 h-5" />
            )}
          </div>

          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-sm font-bold text-[var(--color-text)] truncate">
                {filename}
              </h4>
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-[var(--color-surface-warm)] text-[var(--color-text-muted)] border border-[var(--color-border)]">
                {group.stats.total} خروجی
              </span>
            </div>

            {doc?.created_at && (
              <p className="text-xs text-[var(--color-text-muted)]">
                بارگذاری: {new Date(doc.created_at).toLocaleDateString("fa-IR")}
              </p>
            )}
          </div>
        </div>

        {/* Status Breakdown Chips & Expand Toggle */}
        <div className="flex items-center justify-between sm:justify-end gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap text-xs">
            {group.stats.pending > 0 && (
              <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold border border-amber-500/20">
                {group.stats.pending} در انتظار بازبینی
              </span>
            )}
            {group.stats.approved > 0 && (
              <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold border border-emerald-500/20">
                {group.stats.approved} تأیید شده
              </span>
            )}
            {group.stats.rejected > 0 && (
              <span className="px-2.5 py-1 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 font-bold border border-rose-500/20">
                {group.stats.rejected} رد شده
              </span>
            )}
            {group.stats.needsRevision > 0 && (
              <span className="px-2.5 py-1 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400 font-bold border border-sky-500/20">
                {group.stats.needsRevision} ویرایش‌شده
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 text-[var(--color-text-muted)] p-1 rounded-lg hover:bg-[var(--color-surface-warm)]">
            {isOpen ? (
              <ChevronUp className="w-5 h-5" />
            ) : (
              <ChevronDown className="w-5 h-5" />
            )}
          </div>
        </div>
      </button>

      {/* Group Items Body */}
      {isOpen && (
        <div className="border-t border-[var(--color-border)] bg-[var(--color-surface-warm)]/30 p-3 sm:p-4 space-y-2.5">
          {group.items.length === 0 ? (
            <p className="text-xs text-[var(--color-text-muted)] text-center py-4">
              موردی با فیلتر فعلی برای این فایل یافت نشد.
            </p>
          ) : (
            group.items.map((item: ReviewQueueResource) => (
              <button
                type="button"
                key={item.id}
                onClick={() => onSelectItem(item.id)}
                aria-label={`بازبینی پیش‌نویس ${item.type}: ${item.title}`}
                className="w-full text-right group bg-[var(--color-surface)] hover:bg-[var(--color-surface-warm)] rounded-xl border border-[var(--color-border)] hover:border-[#008080] p-3.5 transition-all cursor-pointer flex items-center justify-between gap-4 focus:outline-none focus:ring-2 focus:ring-[#008080]"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-[var(--color-surface-warm)] border border-[var(--color-border)] flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                    {typeIcon(item.type)}
                  </div>
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[#008080]/10 text-[#008080]">
                        {getTypeName(item.type)}
                      </span>
                      {getStatusBadge(item.status)}
                      <span className="text-xs text-[var(--color-text-muted)]">
                        {new Date(item.updated_at).toLocaleDateString("fa-IR")}
                      </span>
                    </div>
                    <h5 className="text-sm font-bold text-[var(--color-text)] truncate group-hover:text-[#008080] transition-colors">
                      {item.title}
                    </h5>
                  </div>
                </div>

                <div className="flex items-center gap-1 text-xs font-bold text-[#008080] flex-shrink-0 group-hover:-translate-x-0.5 transition-transform">
                  <span>بازبینی پیش‌نویس</span>
                  <ChevronLeft className="w-4 h-4" />
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
