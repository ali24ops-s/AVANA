import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../../lib/api/admin";
import { useAdmin } from "../../hooks/useAdmin.js";
import { useMutation } from "@tanstack/react-query";
import { AdminStatusBadge, AdminConfirmModal } from "../../components/admin/AdminUI";
import { ArrowRight, FileText, HardDrive, User, Calendar, AlertTriangle, RefreshCw } from "lucide-react";

interface DocumentDetail {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  status: string;
  createdAt: string;
  courseName?: string;
  ownerEmail?: string;
}

export function AdminDocumentDetailPage() {
  const { id } = useParams();
  const adminApi = useAdmin();
  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [isRetryModalOpen, setIsRetryModalOpen] = useState(false);
  
  const retryMutation = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error("No ID");
      return adminApi.retryDocument(id);
    },
    onSuccess: () => {
      setIsRetryModalOpen(false);
      if (id) {
        api.get<DocumentDetail>(`/admin/documents/${id}`).then(setDoc);
      }
    },
    onError: (err: any) => {
      alert("خطا در تلاش مجدد: " + err.message);
    }
  });

  useEffect(() => {
    const fetchDoc = async () => {
      try {
        const res = await api.get<DocumentDetail>(`/admin/documents/${id}`);
        setDoc(res);
      } catch (err: any) {
        setError(err.message || "خطا در دریافت جزئیات فایل");
      } finally {
        setLoading(false);
      }
    };
    if (id) fetchDoc();
  }, [id]);

  if (loading) return <div className="text-slate-400">در حال بارگذاری...</div>;
  if (error) return <div className="text-red-400">{error}</div>;
  if (!doc) return <div className="text-slate-400">فایل یافت نشد.</div>;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-4">
        <Link to="/admin/documents" className="p-2 bg-slate-800 rounded-lg hover:bg-slate-700 text-slate-300">
          <ArrowRight className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
            <FileText className="w-6 h-6 text-teal-400" />
            جزئیات فایل
          </h1>
          <p className="text-sm text-slate-400 mt-1">{doc.id}</p>
        </div>
        
        {(doc.status === 'failed' || doc.status === 'error') && (
          <button 
            onClick={() => setIsRetryModalOpen(true)}
            className="mr-auto flex items-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 px-4 py-2 rounded-lg text-sm transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            تلاش مجدد (Retry)
          </button>
        )}
      </div>

      <AdminConfirmModal
        isOpen={isRetryModalOpen}
        title="تلاش مجدد پردازش فایل"
        description="آیا مطمئن هستید که می‌خواهید پردازش این فایل را مجدداً تلاش کنید؟ این کار باعث شروع دوباره فرآیند استخراج متن می‌شود."
        isProcessing={retryMutation.isPending}
        onCancel={() => setIsRetryModalOpen(false)}
        onConfirm={() => retryMutation.mutate()}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="glass-panel p-6 rounded-2xl border border-white/5 space-y-4">
          <h2 className="text-lg font-semibold text-white border-b border-white/10 pb-2">اطلاعات پایه</h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400 flex items-center gap-2"><FileText className="w-4 h-4"/> نام فایل</span>
              <span className="text-slate-200 font-medium break-all" dir="ltr">{doc.originalName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400 flex items-center gap-2"><HardDrive className="w-4 h-4"/> حجم</span>
              <span className="text-slate-200" dir="ltr">{(doc.sizeBytes / 1024 / 1024).toFixed(2)} MB</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400 flex items-center gap-2"><FileText className="w-4 h-4"/> نوع (MIME)</span>
              <span className="text-slate-200" dir="ltr">{doc.mimeType}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400 flex items-center gap-2"><AlertTriangle className="w-4 h-4"/> وضعیت</span>
              <AdminStatusBadge status={doc.status} />
            </div>
          </div>
        </div>

        <div className="glass-panel p-6 rounded-2xl border border-white/5 space-y-4">
          <h2 className="text-lg font-semibold text-white border-b border-white/10 pb-2">روابط و مالکیت</h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400 flex items-center gap-2"><User className="w-4 h-4"/> کاربر ایجاد کننده</span>
              <span className="text-slate-200">{doc.ownerEmail || "-"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400 flex items-center gap-2"><HardDrive className="w-4 h-4"/> دوره مرتبط</span>
              <span className="text-slate-200">{doc.courseName || "-"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400 flex items-center gap-2"><Calendar className="w-4 h-4"/> تاریخ آپلود</span>
              <span className="text-slate-200" dir="ltr">{new Date(doc.createdAt).toLocaleString("fa-IR")}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
