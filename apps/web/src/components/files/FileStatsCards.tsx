import {
  FileText,
  HardDrive,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Link as LinkIcon,
  FolderMinus,
} from "lucide-react";
import type { DocumentStatsResource } from "@avana/contracts";

export interface FileStatsCardsProps {
  stats: DocumentStatsResource | null | undefined;
  isLoading?: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "۰ B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const val = (bytes / Math.pow(k, i)).toFixed(1);
  return `${val} ${sizes[i]}`;
}

export function FileStatsCards({ stats, isLoading }: FileStatsCardsProps) {
  if (isLoading || !stats) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="h-28 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] p-4 animate-pulse shadow-xs"
          />
        ))}
      </div>
    );
  }

  const extractedCount =
    (stats.status_counts?.extracted ?? 0) + (stats.status_counts?.ready ?? 0);
  const processingCount =
    (stats.status_counts?.processing ?? 0) +
    (stats.status_counts?.extracting ?? 0) +
    (stats.status_counts?.uploaded ?? 0) +
    (stats.status_counts?.chunking ?? 0);
  const failedCount = stats.status_counts?.failed ?? 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
      {/* 1. Total Files */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-4 flex flex-col justify-between hover:border-teal-500/40 shadow-xs transition-colors">
        <div className="flex items-center justify-between text-[var(--color-text-muted)]">
          <span className="text-xs font-medium">کل فایل‌ها</span>
          <div className="p-2 rounded-xl bg-teal-50 text-[#008080] border border-teal-200">
            <FileText className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-2">
          <span className="text-2xl font-bold text-[var(--color-text)]">
            {stats.total_count.toLocaleString("fa-IR")}
          </span>
          <span className="text-[11px] text-[var(--color-text-muted)] mr-1.5">فایل</span>
        </div>
      </div>

      {/* 2. Total Storage */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-4 flex flex-col justify-between hover:border-teal-500/40 shadow-xs transition-colors">
        <div className="flex items-center justify-between text-[var(--color-text-muted)]">
          <span className="text-xs font-medium">حجم کل منابع</span>
          <div className="p-2 rounded-xl bg-blue-50 text-blue-600 border border-blue-200">
            <HardDrive className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-2">
          <span className="text-2xl font-bold text-[var(--color-text)] font-mono" dir="ltr">
            {formatBytes(stats.total_size_bytes)}
          </span>
        </div>
      </div>

      {/* 3. Ready / Extracted */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-4 flex flex-col justify-between hover:border-emerald-500/40 shadow-xs transition-colors">
        <div className="flex items-center justify-between text-[var(--color-text-muted)]">
          <span className="text-xs font-medium">آماده استفاده</span>
          <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200">
            <CheckCircle2 className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-2">
          <span className="text-2xl font-bold text-emerald-700">
            {extractedCount.toLocaleString("fa-IR")}
          </span>
          <span className="text-[11px] text-[var(--color-text-muted)] mr-1.5">آماده</span>
        </div>
      </div>

      {/* 4. Processing */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-4 flex flex-col justify-between hover:border-amber-500/40 shadow-xs transition-colors">
        <div className="flex items-center justify-between text-[var(--color-text-muted)]">
          <span className="text-xs font-medium">در حال پردازش</span>
          <div className="p-2 rounded-xl bg-amber-50 text-amber-600 border border-amber-200">
            <Clock className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-2">
          <span className="text-2xl font-bold text-amber-700">
            {processingCount.toLocaleString("fa-IR")}
          </span>
          <span className="text-[11px] text-[var(--color-text-muted)] mr-1.5">در صف</span>
        </div>
      </div>

      {/* 5. Errors */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-4 flex flex-col justify-between hover:border-rose-500/40 shadow-xs transition-colors">
        <div className="flex items-center justify-between text-[var(--color-text-muted)]">
          <span className="text-xs font-medium">دارای خطا</span>
          <div className="p-2 rounded-xl bg-rose-50 text-rose-600 border border-rose-200">
            <AlertTriangle className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-2">
          <span className="text-2xl font-bold text-rose-700">
            {failedCount.toLocaleString("fa-IR")}
          </span>
          <span className="text-[11px] text-[var(--color-text-muted)] mr-1.5">خطا</span>
        </div>
      </div>

      {/* 6. Used vs Unused */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-4 flex flex-col justify-between hover:border-purple-500/40 shadow-xs transition-colors">
        <div className="flex items-center justify-between text-[var(--color-text-muted)]">
          <span className="text-xs font-medium">متصل به دوره</span>
          <div className="p-2 rounded-xl bg-purple-50 text-purple-600 border border-purple-200">
            <LinkIcon className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-2 flex items-baseline justify-between">
          <div>
            <span className="text-2xl font-bold text-purple-700">
              {stats.used_count.toLocaleString("fa-IR")}
            </span>
            <span className="text-[10px] text-[var(--color-text-muted)] mr-1">متصل</span>
          </div>
          <div className="text-[11px] text-[var(--color-text-muted)] flex items-center gap-1">
            <FolderMinus className="w-3 h-3 text-[var(--color-text-muted)]" />
            <span>{stats.unused_count.toLocaleString("fa-IR")} آزاد</span>
          </div>
        </div>
      </div>
    </div>
  );
}
