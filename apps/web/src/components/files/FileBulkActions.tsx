import { Trash2, RefreshCw, BookOpen, X, CheckSquare } from "lucide-react";

export interface FileBulkActionsProps {
  selectedCount: number;
  onClearSelection: () => void;
  onBulkDelete: () => void;
  onBulkReprocess: () => void;
  onBulkAttachCourse: () => void;
  isLoading?: boolean;
}

export function FileBulkActions({
  selectedCount,
  onClearSelection,
  onBulkDelete,
  onBulkReprocess,
  onBulkAttachCourse,
  isLoading,
}: FileBulkActionsProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 max-w-xl w-full px-4 animate-in slide-in-from-bottom duration-300">
      <div
        className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-3 shadow-xl flex items-center justify-between gap-3 text-xs sm:text-sm text-[var(--color-text)]"
        dir="rtl"
      >
        {/* Count */}
        <div className="flex items-center gap-2 pr-2 shrink-0">
          <div className="p-1.5 rounded-lg bg-teal-50 text-[#008080] border border-teal-200">
            <CheckSquare className="w-4 h-4" />
          </div>
          <span className="font-bold text-[var(--color-text)]">
            {selectedCount.toLocaleString("fa-IR")} فایل انتخاب شده
          </span>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <button
            type="button"
            onClick={onBulkAttachCourse}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 transition-colors font-medium shrink-0 disabled:opacity-50"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">اتصال به دوره</span>
          </button>

          <button
            type="button"
            onClick={onBulkReprocess}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 transition-colors font-medium shrink-0 disabled:opacity-50"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">پردازش مجدد</span>
          </button>

          <button
            type="button"
            onClick={onBulkDelete}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition-colors font-medium shrink-0 disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>حذف</span>
          </button>

          <button
            type="button"
            onClick={onClearSelection}
            disabled={isLoading}
            className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-slate-100 transition-colors shrink-0"
            title="لغو انتخاب"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
