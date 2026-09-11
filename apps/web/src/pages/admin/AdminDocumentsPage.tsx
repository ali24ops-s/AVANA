import { useEffect, useState, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api/admin";
import { AdminTable, AdminPagination, AdminSearch, AdminFilter, AdminStatusBadge, AdminLoadingState, AdminEmptyState, AdminErrorState } from "../../components/admin/AdminUI";
import { Sparkles, CheckCircle, AlertCircle, Clock } from "lucide-react";

export interface DocumentGenerationProgress {
  status: "idle" | "queued" | "planning" | "generating" | "reviewing" | "completed" | "failed";
  stage: string | null;
  stageLabel: string | null;
  progress: {
    current: number;
    total: number;
    percentage: number;
  } | null;
  stageStartedAt: string | null;
  lastActivityAt: string | null;
  error: string | null;
}

interface DocumentRecord {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  status: string;
  createdAt: string;
  courseName?: string;
  ownerEmail?: string;
  generationProgress?: DocumentGenerationProgress | null;
}

export function AdminDocumentsPage() {
  const [docs, setDocs] = useState<DocumentRecord[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isPollingRef = useRef(false);

  const pageSize = 20;

  const fetchDocs = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const res = await api.get<{ documents: DocumentRecord[]; totalCount: number }>(`/admin/documents`, {
        params: { page, pageSize, search, status: statusFilter || undefined }
      });
      setDocs(res.documents);
      setTotalCount(res.totalCount);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "خطا در دریافت فایل‌ها");
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [page, search, statusFilter]);

  // Initial and param change fetch
  useEffect(() => {
    const delay = setTimeout(() => {
      fetchDocs(true);
    }, 300);
    return () => clearTimeout(delay);
  }, [fetchDocs]);

  // Live polling for active generation pipelines
  useEffect(() => {
    const hasActiveGeneration = docs.some((d) => {
      const progStatus = d.generationProgress?.status;
      return (
        progStatus === "generating" ||
        progStatus === "planning" ||
        progStatus === "reviewing" ||
        progStatus === "queued" ||
        d.status === "generating" ||
        d.status === "extracting"
      );
    });

    if (!hasActiveGeneration) {
      isPollingRef.current = false;
      return;
    }

    isPollingRef.current = true;
    const interval = setInterval(() => {
      fetchDocs(false);
    }, 3000);

    return () => clearInterval(interval);
  }, [docs, fetchDocs]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const renderGenerationProgress = (doc: DocumentRecord) => {
    const prog = doc.generationProgress;
    const status = prog?.status ?? (doc.status === "generating" ? "generating" : doc.status === "review_pending" ? "reviewing" : doc.status === "ready" ? "completed" : doc.status === "failed" ? "failed" : "idle");

    if (status === "generating" || status === "planning" || status === "reviewing") {
      const stageName = prog?.stageLabel || (status === "planning" ? "برنامه‌ریزی محتوا" : status === "reviewing" ? "بازبینی و اعتبارسنجی" : "تولید محتوا");
      const current = prog?.progress?.current;
      const total = prog?.progress?.total;
      const pct = prog?.progress?.percentage ?? 0;
      const showCount = typeof current === "number" && typeof total === "number" && total > 1;

      return (
        <div className="flex flex-col gap-1.5 min-w-[140px]">
          <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-primary-default)]">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--color-primary-default)] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--color-primary-default)]"></span>
            </span>
            <span className="truncate max-w-[120px]" title={stageName}>{stageName}</span>
            {showCount && (
              <span className="text-[var(--color-text-muted)] text-[11px]" dir="ltr">({current}/{total})</span>
            )}
          </div>
          <div className="w-full bg-[var(--color-surface-subtle)] border border-[var(--color-border)] rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-[var(--color-primary-default)] h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${Math.max(5, pct)}%` }}
            />
          </div>
        </div>
      );
    }

    if (status === "queued") {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/20">
          <Clock className="w-3 h-3 animate-spin" />
          در صف انتظار
        </span>
      );
    }

    if (status === "completed" || doc.status === "ready") {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
          <CheckCircle className="w-3 h-3" />
          تولید شده
        </span>
      );
    }

    if (status === "failed") {
      return (
        <span
          className="inline-flex items-center gap-1 text-xs font-medium text-rose-600 dark:text-rose-400 bg-rose-500/10 px-2.5 py-0.5 rounded-full border border-rose-500/20 cursor-help"
          title={prog?.error || "خطا در تولید محتوا"}
        >
          <AlertCircle className="w-3 h-3" />
          خطا در تولید
        </span>
      );
    }

    return <span className="text-[var(--color-text-muted)] text-xs">-</span>;
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)] flex items-center gap-2.5">
            <Sparkles className="w-6 h-6 text-[var(--color-primary-default)]" />
            فایل‌ها و اسناد
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">مدیریت فایل‌ها و نظارت بر خط لوله تولید محتوای هوش مصنوعی</p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <AdminFilter
            value={statusFilter}
            onChange={(v) => { setStatusFilter(v); setPage(1); }}
            options={[
              { value: "", label: "همه وضعیت‌ها" },
              { value: "uploaded", label: "آپلود شده" },
              { value: "extracting", label: "در حال استخراج متن" },
              { value: "extracted", label: "استخراج شده" },
              { value: "generating", label: "در حال تولید هوش مصنوعی" },
              { value: "review_pending", label: "در انتظار بازبینی" },
              { value: "ready", label: "آماده و نهایی" },
              { value: "failed", label: "خطا" }
            ]}
          />
          <AdminSearch value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="جستجوی نام فایل..." />
        </div>
      </div>

      <AdminTable headers={["نام فایل", "وضعیت سند", "خط لوله تولید AI", "حجم", "دوره", "مالک", "تاریخ ایجاد", "عملیات"]}>
        {loading ? (
          <AdminLoadingState colSpan={8} />
        ) : error ? (
          <AdminErrorState message={error} colSpan={8} />
        ) : docs.length === 0 ? (
          <AdminEmptyState message="فایلی یافت نشد." />
        ) : (
          docs.map(doc => (
            <tr key={doc.id} className="hover:bg-[var(--color-surface-subtle)] transition-colors">
              <td className="px-6 py-4 max-w-xs truncate font-medium text-[var(--color-text)]" title={doc.originalName}>{doc.originalName}</td>
              <td className="px-6 py-4"><AdminStatusBadge status={doc.status} /></td>
              <td className="px-6 py-4">{renderGenerationProgress(doc)}</td>
              <td className="px-6 py-4 text-[var(--color-text-muted)] font-mono text-xs" dir="ltr">{(doc.sizeBytes / 1024 / 1024).toFixed(2)} MB</td>
              <td className="px-6 py-4 text-[var(--color-text-muted)] max-w-xs truncate">{doc.courseName || "-"}</td>
              <td className="px-6 py-4 text-[var(--color-text-muted)] font-mono text-xs" dir="ltr">{doc.ownerEmail || "-"}</td>
              <td className="px-6 py-4 text-[var(--color-text-muted)] text-xs" dir="ltr">{new Date(doc.createdAt).toLocaleDateString("fa-IR")}</td>
              <td className="px-6 py-4">
                <Link to={`/admin/documents/${doc.id}`} className="text-[var(--color-primary-default)] hover:underline font-medium text-xs sm:text-sm">جزئیات</Link>
              </td>
            </tr>
          ))
        )}
      </AdminTable>
      <AdminPagination page={page} totalPages={totalPages} totalCount={totalCount} onPageChange={setPage} />
    </div>
  );
}

