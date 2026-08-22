import { Search, X, Filter, ArrowUpDown, RefreshCw } from "lucide-react";
import type { DocumentListFilters } from "../../lib/api/documents.js";
import type { DocumentStatus } from "@avana/contracts";

export interface FileFilterToolbarProps {
  filters: DocumentListFilters;
  onChange: (filters: DocumentListFilters) => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

const FILE_TYPE_OPTIONS = [
  { label: "همه انواع", value: "" },
  { label: "PDF", value: "application/pdf" },
  { label: "Word", value: "application/vnd.openxmlformats-officedocument.wordprocessingml" },
  { label: "PowerPoint", value: "application/vnd.openxmlformats-officedocument.presentationml" },
  { label: "متنی (TXT/MD)", value: "text/" },
  { label: "تصویر", value: "image/" },
  { label: "ویدیو", value: "video/" },
  { label: "صوت", value: "audio/" },
];

const STATUS_OPTIONS: Array<{ label: string; value: DocumentStatus | "" }> = [
  { label: "همه وضعیت‌ها", value: "" },
  { label: "آماده استفاده", value: "extracted" },
  { label: "در حال پردازش", value: "extracting" },
  { label: "آپلود شده", value: "uploaded" },
  { label: "دارای خطا", value: "failed" },
];

const USAGE_OPTIONS: Array<{ label: string; value: "used" | "unused" | "" }> = [
  { label: "همه فایل‌ها", value: "" },
  { label: "متصل به دوره", value: "used" },
  { label: "بدون استفاده (آزاد)", value: "unused" },
];

const SORT_OPTIONS: Array<{
  label: string;
  value: NonNullable<DocumentListFilters["sort"]>;
}> = [
  { label: "جدیدترین", value: "newest" },
  { label: "قدیمی‌ترین", value: "oldest" },
  { label: "بیشترین حجم", value: "largest" },
  { label: "کمترین حجم", value: "smallest" },
  { label: "نام فایل (الفبا)", value: "name" },
  { label: "آخرین به‌روزرسانی", value: "updated" },
];

export function FileFilterToolbar({
  filters,
  onChange,
  onRefresh,
  isRefreshing,
}: FileFilterToolbarProps) {
  const hasActiveFilters =
    Boolean(filters.search) ||
    Boolean(filters.type) ||
    Boolean(filters.status) ||
    Boolean(filters.used) ||
    (filters.sort && filters.sort !== "newest");

  const handleClearFilters = () => {
    onChange({
      search: undefined,
      type: undefined,
      status: undefined,
      used: undefined,
      sort: "newest",
      page: 1,
      limit: filters.limit,
    });
  };

  return (
    <div className="glass-panel border border-white/10 rounded-2xl p-4 mb-6 space-y-4 shadow-ambient">
      {/* Top row: Search input + Actions */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        {/* Search Bar */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={filters.search ?? ""}
            onChange={(e) =>
              onChange({
                ...filters,
                search: e.target.value || undefined,
                page: 1,
              })
            }
            placeholder="جستجوی نام فایل، دوره، درس یا نوع فایل..."
            className="w-full pl-9 pr-10 py-2 rounded-xl border border-white/10 bg-white/5 text-slate-200 text-xs sm:text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
          />
          {filters.search && (
            <button
              type="button"
              onClick={() => onChange({ ...filters, search: undefined, page: 1 })}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-0.5 rounded-full hover:bg-white/10"
              aria-label="پاک کردن جستجو"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Refresh & Reset Controls */}
        <div className="flex items-center gap-2 shrink-0">
          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleClearFilters}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              <span>پاک کردن فیلترها</span>
            </button>
          )}

          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={isRefreshing}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-300 bg-white/5 hover:bg-white/10 border border-white/10 transition-colors disabled:opacity-50"
              aria-label="تازه‌سازی لیست"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-teal-400" : ""}`}
              />
              <span className="hidden sm:inline">تازه‌سازی</span>
            </button>
          )}
        </div>
      </div>

      {/* Bottom row: Filter Dropdowns & Type Pills */}
      <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-white/5 text-xs">
        {/* File Type Filter */}
        <div className="flex items-center gap-1.5">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-400 font-medium">نوع فایل:</span>
          <select
            value={filters.type ?? ""}
            onChange={(e) =>
              onChange({
                ...filters,
                type: e.target.value || undefined,
                page: 1,
              })
            }
            className="bg-[#131d31] border border-white/10 rounded-xl px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-teal-500"
          >
            {FILE_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Processing Status Filter */}
        <div className="flex items-center gap-1.5">
          <span className="text-slate-400 font-medium">وضعیت:</span>
          <select
            value={filters.status ?? ""}
            onChange={(e) =>
              onChange({
                ...filters,
                status: (e.target.value as DocumentStatus) || undefined,
                page: 1,
              })
            }
            className="bg-[#131d31] border border-white/10 rounded-xl px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-teal-500"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Usage Filter */}
        <div className="flex items-center gap-1.5">
          <span className="text-slate-400 font-medium">محل استفاده:</span>
          <select
            value={filters.used ?? ""}
            onChange={(e) =>
              onChange({
                ...filters,
                used: (e.target.value as "used" | "unused") || undefined,
                page: 1,
              })
            }
            className="bg-[#131d31] border border-white/10 rounded-xl px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-teal-500"
          >
            {USAGE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Sort Selector */}
        <div className="flex items-center gap-1.5 mr-auto">
          <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-400 font-medium">مرتب‌سازی:</span>
          <select
            value={filters.sort ?? "newest"}
            onChange={(e) =>
              onChange({
                ...filters,
                sort: e.target.value as DocumentListFilters["sort"],
              })
            }
            className="bg-[#131d31] border border-white/10 rounded-xl px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-teal-500"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
