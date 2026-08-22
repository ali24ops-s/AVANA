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
            className="h-28 rounded-2xl glass-panel border border-white/10 p-4 animate-pulse bg-white/5"
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
      <div className="glass-panel border border-white/10 rounded-2xl p-4 flex flex-col justify-between hover:border-teal-500/30 transition-colors">
        <div className="flex items-center justify-between text-slate-400">
          <span className="text-xs font-medium">کل فایل‌ها</span>
          <div className="p-2 rounded-xl bg-teal-500/10 text-teal-400">
            <FileText className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-2">
          <span className="text-2xl font-bold text-white">
            {stats.total_count.toLocaleString("fa-IR")}
          </span>
          <span className="text-[11px] text-slate-400 mr-1.5">فایل</span>
        </div>
      </div>

      {/* 2. Total Storage */}
      <div className="glass-panel border border-white/10 rounded-2xl p-4 flex flex-col justify-between hover:border-teal-500/30 transition-colors">
        <div className="flex items-center justify-between text-slate-400">
          <span className="text-xs font-medium">حجم کل منابع</span>
          <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400">
            <HardDrive className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-2">
          <span className="text-2xl font-bold text-white font-mono" dir="ltr">
            {formatBytes(stats.total_size_bytes)}
          </span>
        </div>
      </div>

      {/* 3. Ready / Extracted */}
      <div className="glass-panel border border-white/10 rounded-2xl p-4 flex flex-col justify-between hover:border-emerald-500/30 transition-colors">
        <div className="flex items-center justify-between text-slate-400">
          <span className="text-xs font-medium">آماده استفاده</span>
          <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
            <CheckCircle2 className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-2">
          <span className="text-2xl font-bold text-emerald-400">
            {extractedCount.toLocaleString("fa-IR")}
          </span>
          <span className="text-[11px] text-slate-400 mr-1.5">آماده</span>
        </div>
      </div>

      {/* 4. Processing */}
      <div className="glass-panel border border-white/10 rounded-2xl p-4 flex flex-col justify-between hover:border-amber-500/30 transition-colors">
        <div className="flex items-center justify-between text-slate-400">
          <span className="text-xs font-medium">در حال پردازش</span>
          <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
            <Clock className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-2">
          <span className="text-2xl font-bold text-amber-400">
            {processingCount.toLocaleString("fa-IR")}
          </span>
          <span className="text-[11px] text-slate-400 mr-1.5">در صف</span>
        </div>
      </div>

      {/* 5. Errors */}
      <div className="glass-panel border border-white/10 rounded-2xl p-4 flex flex-col justify-between hover:border-rose-500/30 transition-colors">
        <div className="flex items-center justify-between text-slate-400">
          <span className="text-xs font-medium">دارای خطا</span>
          <div className="p-2 rounded-xl bg-rose-500/10 text-rose-400">
            <AlertTriangle className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-2">
          <span className="text-2xl font-bold text-rose-400">
            {failedCount.toLocaleString("fa-IR")}
          </span>
          <span className="text-[11px] text-slate-400 mr-1.5">خطا</span>
        </div>
      </div>

      {/* 6. Used vs Unused */}
      <div className="glass-panel border border-white/10 rounded-2xl p-4 flex flex-col justify-between hover:border-purple-500/30 transition-colors">
        <div className="flex items-center justify-between text-slate-400">
          <span className="text-xs font-medium">متصل به دوره</span>
          <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400">
            <LinkIcon className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-2 flex items-baseline justify-between">
          <div>
            <span className="text-2xl font-bold text-purple-300">
              {stats.used_count.toLocaleString("fa-IR")}
            </span>
            <span className="text-[10px] text-slate-400 mr-1">متصل</span>
          </div>
          <div className="text-[11px] text-slate-400 flex items-center gap-1">
            <FolderMinus className="w-3 h-3 text-slate-400" />
            <span>{stats.unused_count.toLocaleString("fa-IR")} آزاد</span>
          </div>
        </div>
      </div>
    </div>
  );
}
