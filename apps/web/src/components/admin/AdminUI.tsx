import { ReactNode } from "react";
import { Search, ChevronRight, ChevronLeft, Filter, AlertTriangle } from "lucide-react";
import { toPersianDigits, formatPersianOf } from "@avana/domain";
import { Button } from "../ui/index.js";

export function AdminSearch({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative w-full sm:w-64">
      <input
        type="text"
        placeholder={placeholder || "جستجو..."}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl ps-4 pe-10 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-default)] focus:border-transparent transition-all"
      />
      <Search className="w-4 h-4 text-[var(--color-text-muted)] absolute end-3 top-3 pointer-events-none" />
    </div>
  );
}

export function AdminPagination({ page, totalPages, totalCount, onPageChange }: { page: number; totalPages: number; totalCount: number; onPageChange: (p: number) => void }) {
  return (
    <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--color-border)] bg-[var(--color-surface-warm)]/50">
      <span className="text-xs sm:text-sm text-[var(--color-text-muted)]">
        مجموع: {toPersianDigits(totalCount)} رکورد
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={page === 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="صفحه قبل"
          className="p-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--color-surface-warm)] transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <span className="text-xs sm:text-sm text-[var(--color-text)] px-2 py-1 font-medium">
          {formatPersianOf(page, totalPages, { prefix: "صفحه" })}
        </span>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="صفحه بعد"
          className="p-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--color-surface-warm)] transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export function AdminStatusBadge({ status, colorMap }: { status: string; colorMap?: Record<string, string> }) {
  const defaultColors: Record<string, string> = {
    completed: "text-emerald-600 dark:text-emerald-300 bg-emerald-500/10 border-emerald-500/20",
    published: "text-emerald-600 dark:text-emerald-300 bg-emerald-500/10 border-emerald-500/20",
    healthy: "text-emerald-600 dark:text-emerald-300 bg-emerald-500/10 border-emerald-500/20",
    active: "text-emerald-600 dark:text-emerald-300 bg-emerald-500/10 border-emerald-500/20",
    failed: "text-rose-600 dark:text-rose-300 bg-rose-500/10 border-rose-500/20",
    error: "text-rose-600 dark:text-rose-300 bg-rose-500/10 border-rose-500/20",
    unhealthy: "text-rose-600 dark:text-rose-300 bg-rose-500/10 border-rose-500/20",
    processing: "text-sky-600 dark:text-sky-300 bg-sky-500/10 border-sky-500/20",
    queued: "text-amber-600 dark:text-amber-300 bg-amber-500/10 border-amber-500/20",
    warning: "text-amber-600 dark:text-amber-300 bg-amber-500/10 border-amber-500/20",
    degraded: "text-amber-600 dark:text-amber-300 bg-amber-500/10 border-amber-500/20",
    draft: "text-[var(--color-text-muted)] bg-[var(--color-surface-warm)] border-[var(--color-border)]",
    disabled: "text-[var(--color-text-muted)] bg-[var(--color-surface-warm)] border-[var(--color-border)]",
    not_configured: "text-[var(--color-text-muted)] bg-[var(--color-surface-warm)] border-[var(--color-border)]",
    unknown: "text-[var(--color-text-muted)] bg-[var(--color-surface-warm)] border-[var(--color-border)]",
    inactive: "text-[var(--color-text-muted)] bg-[var(--color-surface-warm)] border-[var(--color-border)]",
  };
  const mapToUse = colorMap || defaultColors;
  const color = mapToUse[status.toLowerCase()] || "text-[var(--color-text-muted)] bg-[var(--color-surface-warm)] border-[var(--color-border)]";
  
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${color}`}>
      {status}
    </span>
  );
}

export function AdminFilter({ value, onChange, options, label }: { value: string; onChange: (v: string) => void; options: {value: string, label: string}[]; label?: string }) {
  return (
    <div className="flex items-center gap-2">
      {label && <Filter className="w-4 h-4 text-[var(--color-text-muted)]" />}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-default)] focus:border-transparent transition-all"
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}

export function AdminEmptyState({ message = "رکوردی یافت نشد." }: { message?: string }) {
  return (
    <tr>
      <td colSpan={100} className="px-6 py-12 text-center text-[var(--color-text-muted)]">
        <div className="flex flex-col items-center gap-2">
          <div className="w-12 h-12 rounded-full bg-[var(--color-surface-warm)] border border-[var(--color-border)] flex items-center justify-center">
            <Filter className="w-6 h-6 text-[var(--color-text-muted)]" />
          </div>
          <p className="text-sm font-medium">{message}</p>
        </div>
      </td>
    </tr>
  );
}

export function AdminLoadingState({ colSpan }: { colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-6 py-8 text-center text-[var(--color-text-muted)]">
        <span className="text-sm">در حال بارگذاری...</span>
      </td>
    </tr>
  );
}

export function AdminErrorState({ message, colSpan }: { message: string; colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-6 py-8 text-center text-[var(--color-error)]">
        <div className="flex flex-col items-center gap-2">
          <AlertTriangle className="w-6 h-6 text-[var(--color-error)]" />
          <p className="text-sm font-medium">{message}</p>
        </div>
      </td>
    </tr>
  );
}

export function AdminTable({ headers, children }: { headers: string[]; children: ReactNode }) {
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-right text-sm">
          <thead className="bg-[var(--color-surface-warm)]/60 text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
            <tr>
              {headers.map((h, i) => (
                <th key={i} className="px-6 py-3.5 font-bold whitespace-nowrap text-xs sm:text-sm">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {children}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AdminConfirmModal({ isOpen, title, description, onConfirm, onCancel, isProcessing }: { isOpen: boolean; title: string; description: string; onConfirm: () => void; onCancel: () => void; isProcessing?: boolean }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 w-full max-w-md shadow-2xl" dir="rtl">
        <h3 className="text-lg font-bold text-[var(--color-text)] mb-2">{title}</h3>
        <p className="text-[var(--color-text-muted)] text-sm mb-6 leading-relaxed">{description}</p>
        <div className="flex justify-end gap-3">
          <Button 
            variant="secondary"
            size="sm"
            onClick={onCancel} 
            disabled={isProcessing}
          >
            انصراف
          </Button>
          <Button 
            variant="primary"
            size="sm"
            onClick={onConfirm} 
            disabled={isProcessing}
            isLoading={isProcessing}
          >
            تأیید
          </Button>
        </div>
      </div>
    </div>
  );
}
