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
  CheckCheck,
  XCircle,
  AlertCircle,
  RefreshCw,
  Loader2,
} from "lucide-react";
import type {
  ReviewDocumentGroupResource,
  ReviewQueueResource,
  GeneratedContentType,
} from "@avana/contracts";

export interface ReviewDocumentGroupProps {
  group: ReviewDocumentGroupResource;
  onSelectItem: (contentId: string) => void;
  isOpen?: boolean;
  onToggle?: () => void;
  defaultExpanded?: boolean;
  onApproveAll?: (documentId: string) => Promise<void>;
  isApprovingAll?: boolean;
}

export function ReviewDocumentGroup({
  group,
  onSelectItem,
  isOpen: controlledIsOpen,
  onToggle: controlledOnToggle,
  defaultExpanded,
  onApproveAll,
  isApprovingAll = false,
}: ReviewDocumentGroupProps) {
  const [uncontrolledIsOpen, setUncontrolledIsOpen] = useState(
    defaultExpanded !== undefined ? defaultExpanded : false,
  );
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const [modalError, setModalError] = useState<string | null>(null);

  const isControlled = controlledIsOpen !== undefined;
  const isOpen = isControlled ? controlledIsOpen : uncontrolledIsOpen;
  const handleToggle = isControlled
    ? controlledOnToggle ?? (() => {})
    : () => setUncontrolledIsOpen((prev) => !prev);

  const doc = group.document;
  const filename = doc?.filename || doc?.title || "منبع نامشخص";
  const isUnknown = !doc;

  const handleConfirmApproveAll = async () => {
    if (!onApproveAll || !group.document?.id) return;
    try {
      setModalError(null);
      await onApproveAll(group.document.id);
      setShowConfirmModal(false);
    } catch (err) {
      setModalError(err instanceof Error ? err.message : "خطا در تأیید یکجای پیش‌نویس‌ها");
    }
  };

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
    <>
      <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] shadow-sm overflow-hidden transition-all duration-200">
        {/* Group Header Container */}
        <div
          onClick={handleToggle}
          role="button"
          tabIndex={0}
          aria-expanded={isOpen}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              if ((e.target as HTMLElement).tagName !== "BUTTON") {
                e.preventDefault();
                handleToggle();
              }
            }
          }}
          className="w-full text-right p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-[var(--color-surface-warm)]/60 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#008080] focus:ring-inset"
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

          {/* Status Breakdown Chips & Actions */}
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

            {/* Bulk Approve Button */}
            {onApproveAll && group.document?.id && (
              <div className="flex items-center">
                {group.stats.pending > 0 ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setModalError(null);
                      setShowConfirmModal(true);
                    }}
                    disabled={isApprovingAll}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#008080] hover:bg-[#006666] text-white font-bold text-xs shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#008080]"
                    aria-label={`تأیید همه پیش‌نویس‌های ${filename}`}
                  >
                    {isApprovingAll ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CheckCheck className="w-3.5 h-3.5" />
                    )}
                    <span>تأیید همه</span>
                  </button>
                ) : group.stats.total > 0 ? (
                  <button
                    type="button"
                    disabled
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--color-surface-warm)] text-[var(--color-text-muted)] font-bold text-xs border border-[var(--color-border)] opacity-70 cursor-not-allowed"
                    title="تمامی پیش‌نویس‌های این بسته تأیید شده‌اند"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    <span>همه تأیید شده</span>
                  </button>
                ) : null}
              </div>
            )}

            <div className="flex items-center gap-1 text-[var(--color-text-muted)] p-1 rounded-lg hover:bg-[var(--color-surface-warm)]">
              {isOpen ? (
                <ChevronUp className="w-5 h-5" />
              ) : (
                <ChevronDown className="w-5 h-5" />
              )}
            </div>
          </div>
        </div>

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

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-bulk-approve-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 font-sans"
          dir="rtl"
          onClick={() => {
            if (!isApprovingAll) {
              setShowConfirmModal(false);
            }
          }}
        >
          <div
            className="bg-[var(--color-surface)] rounded-3xl border border-[var(--color-border)] w-full max-w-md overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b border-[var(--color-border)]">
              <h3
                id="confirm-bulk-approve-title"
                className="font-bold text-base text-[var(--color-text)] flex items-center gap-2"
              >
                <CheckCheck className="w-5 h-5 text-[#008080]" />
                <span>تأیید یکجای محتوای بسته</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                disabled={isApprovingAll}
                aria-label="بستن پنجره"
                className="p-1 rounded-xl text-[var(--color-text-muted)] hover:text-[var(--color-text)] disabled:opacity-50"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                آیا از تأیید تمامی پیش‌نویس‌های در انتظار بازبینی (
                <strong className="text-[var(--color-text)] font-bold">
                  {group.stats.pending} مورد
                </strong>
                ) متعلق به منبع «
                <strong className="text-[var(--color-text)] font-bold">
                  {filename}
                </strong>
                » اطمینان دارید؟
              </p>
              <p className="text-xs text-[var(--color-text-muted)] leading-relaxed bg-[var(--color-surface-warm)] p-3 rounded-xl border border-[var(--color-border)]">
                با این کار، تمام درس‌ها، فلش‌کارت‌ها و آزمون‌های این بسته به‌صورت هم‌زمان ایجاد و به ساختار دوره افزوده خواهند شد.
              </p>

              {modalError && (
                <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-xs">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 p-4 border-t border-[var(--color-border)] bg-[var(--color-surface-warm)]">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                disabled={isApprovingAll}
                className="px-4 py-2 text-xs font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text)] disabled:opacity-50"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleConfirmApproveAll}
                disabled={isApprovingAll}
                className="px-5 py-2.5 bg-[#008080] hover:bg-[#006666] disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-[#008080]"
              >
                {isApprovingAll ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>در حال تأیید...</span>
                  </>
                ) : (
                  <>
                    <CheckCheck className="w-3.5 h-3.5" />
                    <span>تأیید و افزودن به دوره ({group.stats.pending})</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
