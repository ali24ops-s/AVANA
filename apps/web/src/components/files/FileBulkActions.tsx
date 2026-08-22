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
        className="glass-panel bg-slate-900/95 border border-teal-500/40 rounded-2xl p-3 shadow-2xl backdrop-blur-2xl flex items-center justify-between gap-3 text-xs sm:text-sm text-slate-200"
        dir="rtl"
      >
        {/* Count */}
        <div className="flex items-center gap-2 pr-2 shrink-0">
          <div className="p-1.5 rounded-lg bg-teal-500/20 text-teal-400">
            <CheckSquare className="w-4 h-4" />
          </div>
          <span className="font-bold text-white">
            {selectedCount.toLocaleString("fa-IR")} فایل انتخاب شده
          </span>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <button
            type="button"
            onClick={onBulkAttachCourse}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-purple-300 border border-purple-500/20 transition-colors font-medium shrink-0 disabled:opacity-50"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">اتصال به دوره</span>
          </button>

          <button
            type="button"
            onClick={onBulkReprocess}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-amber-300 border border-amber-500/20 transition-colors font-medium shrink-0 disabled:opacity-50"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">پردازش مجدد</span>
          </button>

          <button
            type="button"
            onClick={onBulkDelete}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition-colors font-medium shrink-0 disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>حذف</span>
          </button>

          <button
            type="button"
            onClick={onClearSelection}
            disabled={isLoading}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors shrink-0"
            title="لغو انتخاب"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
