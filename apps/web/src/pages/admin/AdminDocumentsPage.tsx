import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api/admin";
import { AdminTable, AdminPagination, AdminSearch, AdminFilter, AdminStatusBadge, AdminLoadingState, AdminEmptyState, AdminErrorState } from "../../components/admin/AdminUI";

interface DocumentRecord {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  status: string;
  createdAt: string;
  courseName?: string;
  ownerEmail?: string;
}

export function AdminDocumentsPage() {
  const [docs, setDocs] = useState<DocumentRecord[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const pageSize = 20;

  useEffect(() => {
    let active = true;
    const fetchDocs = async () => {
      setLoading(true);
      try {
        const res = await api.get<{ documents: DocumentRecord[]; totalCount: number }>(`/admin/documents`, {
          params: { page, pageSize, search, status: statusFilter || undefined }
        });
        if (active) {
          setDocs(res.documents);
          setTotalCount(res.totalCount);
          setError(null);
        }
      } catch (err: unknown) {
        if (active) setError(err instanceof Error ? err.message : "خطا در دریافت فایل‌ها");
      } finally {
        if (active) setLoading(false);
      }
    };

    const delay = setTimeout(fetchDocs, 300);
    return () => {
      active = false;
      clearTimeout(delay);
    };
  }, [page, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">فایل‌ها و اسناد</h1>
          <p className="text-sm text-slate-400 mt-1">مدیریت فایل‌های آپلودی کاربران</p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <AdminFilter
            value={statusFilter}
            onChange={(v) => { setStatusFilter(v); setPage(1); }}
            options={[
              { value: "", label: "همه وضعیت‌ها" },
              { value: "uploaded", label: "آپلود شده" },
              { value: "processing", label: "در حال پردازش" },
              { value: "processed", label: "پردازش شده" },
              { value: "error", label: "خطا" }
            ]}
          />
          <AdminSearch value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="جستجوی نام فایل..." />
        </div>
      </div>

      <AdminTable headers={["نام فایل", "وضعیت", "حجم", "دوره", "مالک", "تاریخ ایجاد", "عملیات"]}>
        {loading ? (
          <AdminLoadingState colSpan={7} />
        ) : error ? (
          <AdminErrorState message={error} colSpan={7} />
        ) : docs.length === 0 ? (
          <AdminEmptyState message="فایلی یافت نشد." />
        ) : (
          docs.map(doc => (
            <tr key={doc.id} className="hover:bg-white/5 transition-colors">
              <td className="px-6 py-4 max-w-xs truncate" title={doc.originalName}>{doc.originalName}</td>
              <td className="px-6 py-4"><AdminStatusBadge status={doc.status} /></td>
              <td className="px-6 py-4 text-slate-400" dir="ltr">{(doc.sizeBytes / 1024 / 1024).toFixed(2)} MB</td>
              <td className="px-6 py-4 text-slate-400 max-w-xs truncate">{doc.courseName || "-"}</td>
              <td className="px-6 py-4 text-slate-400">{doc.ownerEmail || "-"}</td>
              <td className="px-6 py-4 text-slate-400" dir="ltr">{new Date(doc.createdAt).toLocaleDateString("fa-IR")}</td>
              <td className="px-6 py-4">
                <Link to={`/admin/documents/${doc.id}`} className="text-teal-400 hover:text-teal-300 font-medium">جزئیات</Link>
              </td>
            </tr>
          ))
        )}
      </AdminTable>
      <AdminPagination page={page} totalPages={totalPages} totalCount={totalCount} onPageChange={setPage} />
    </div>
  );
}
