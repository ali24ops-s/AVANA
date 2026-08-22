import { ReactNode } from "react";
import { Search, ChevronRight, ChevronLeft, Filter, AlertTriangle } from "lucide-react";

export function AdminSearch({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative w-full sm:w-64">
      <input
        type="text"
        placeholder={placeholder || "جستجو..."}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-slate-900/50 border border-slate-700 rounded-xl pl-4 pr-10 py-2 text-sm text-slate-200 focus:outline-none focus:border-teal-500 transition-colors"
      />
      <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
    </div>
  );
}

export function AdminPagination({ page, totalPages, totalCount, onPageChange }: { page: number; totalPages: number; totalCount: number; onPageChange: (p: number) => void }) {
  return (
    <div className="flex items-center justify-between px-6 py-4 border-t border-white/5 bg-slate-800/30">
      <span className="text-sm text-slate-400">
        مجموع: {totalCount} رکورد
      </span>
      <div className="flex gap-2">
        <button
          disabled={page === 1}
          onClick={() => onPageChange(page - 1)}
          className="p-1 rounded bg-slate-800 text-slate-300 disabled:opacity-50 hover:bg-slate-700 transition-colors"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
        <span className="text-sm text-slate-300 px-2 py-1">
          صفحه {page} از {totalPages}
        </span>
        <button
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="p-1 rounded bg-slate-800 text-slate-300 disabled:opacity-50 hover:bg-slate-700 transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

export function AdminStatusBadge({ status, colorMap }: { status: string; colorMap?: Record<string, string> }) {
  const defaultColors: Record<string, string> = {
    completed: "text-green-400 bg-green-400/10",
    failed: "text-red-400 bg-red-400/10",
    processing: "text-blue-400 bg-blue-400/10",
    queued: "text-orange-400 bg-orange-400/10",
    published: "text-green-400 bg-green-400/10",
    draft: "text-slate-400 bg-slate-400/10",
    error: "text-red-400 bg-red-400/10",
    healthy: "text-green-400 bg-green-400/10",
    warning: "text-orange-400 bg-orange-400/10",
  };
  const mapToUse = colorMap || defaultColors;
  const color = mapToUse[status.toLowerCase()] || "text-slate-400 bg-slate-800";
  
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {status}
    </span>
  );
}

export function AdminFilter({ value, onChange, options, label }: { value: string; onChange: (v: string) => void; options: {value: string, label: string}[]; label?: string }) {
  return (
    <div className="flex items-center gap-2">
      {label && <Filter className="w-4 h-4 text-slate-400" />}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-slate-900/50 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-teal-500"
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
      <td colSpan={100} className="px-6 py-12 text-center text-slate-400">
        <div className="flex flex-col items-center gap-2">
          <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center">
            <Filter className="w-6 h-6 text-slate-500" />
          </div>
          <p>{message}</p>
        </div>
      </td>
    </tr>
  );
}

export function AdminLoadingState({ colSpan }: { colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-6 py-8 text-center text-slate-400">
        در حال بارگذاری...
      </td>
    </tr>
  );
}

export function AdminErrorState({ message, colSpan }: { message: string; colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-6 py-8 text-center text-red-400">
        <div className="flex flex-col items-center gap-2">
          <AlertTriangle className="w-6 h-6 text-red-500" />
          <p>{message}</p>
        </div>
      </td>
    </tr>
  );
}

export function AdminTable({ headers, children }: { headers: string[]; children: ReactNode }) {
  return (
    <div className="glass-panel border border-white/5 rounded-2xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-right text-sm">
          <thead className="bg-slate-800/50 text-slate-400 border-b border-white/5">
            <tr>
              {headers.map((h, i) => (
                <th key={i} className="px-6 py-4 font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl" dir="rtl">
        <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
        <p className="text-slate-300 text-sm mb-6 leading-relaxed">{description}</p>
        <div className="flex justify-end gap-3">
          <button 
            onClick={onCancel} 
            disabled={isProcessing}
            className="px-4 py-2 text-sm text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
          >
            انصراف
          </button>
          <button 
            onClick={onConfirm} 
            disabled={isProcessing}
            className="px-4 py-2 text-sm text-white bg-teal-600 hover:bg-teal-500 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {isProcessing ? "در حال انجام..." : "تأیید"}
          </button>
        </div>
      </div>
    </div>
  );
}
