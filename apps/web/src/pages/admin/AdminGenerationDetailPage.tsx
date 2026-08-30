import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api, type AdminGenerationDetail } from "../../lib/api/admin";
import { useAdmin } from "../../hooks/useAdmin.js";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AdminStatusBadge, AdminConfirmModal } from "../../components/admin/AdminUI";
import { ArrowRight, Cpu, Clock, AlertTriangle, RefreshCw, User, Building, Book, FileText, Database, Code } from "lucide-react";

export function AdminGenerationDetailPage() {
  const { id } = useParams();
  const adminApi = useAdmin();
  const [job, setJob] = useState<AdminGenerationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payloadExpanded, setPayloadExpanded] = useState(false);

  const [isRetryModalOpen, setIsRetryModalOpen] = useState(false);
  const queryClient = useQueryClient();
  
  const retryMutation = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error("No ID");
      return adminApi.retryGenerationJob(id);
    },
    onSuccess: () => {
      setIsRetryModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["admin", "generation"] });
      if (id) {
        api.get<AdminGenerationDetail>(`/admin/generation/${id}`).then(setJob);
      }
    },
    onError: (err: any) => {
      alert("خطا در تلاش مجدد: " + err.message);
    }
  });

  useEffect(() => {
    const fetch = async () => {
      try {
        const res = await api.get<AdminGenerationDetail>(`/admin/generation/${id}`);
        setJob(res);
      } catch (err: any) {
        setError(err.message || "خطا در دریافت جزئیات Job");
      } finally {
        setLoading(false);
      }
    };
    if (id) fetch();
  }, [id]);

  if (loading) return <div className="text-slate-400">در حال بارگذاری...</div>;
  if (error) return <div className="text-red-400">{error}</div>;
  if (!job) return <div className="text-slate-400">Job یافت نشد.</div>;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-4">
        <Link to="/admin/generation" className="p-2 bg-slate-800 rounded-lg hover:bg-slate-700 text-slate-300">
          <ArrowRight className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
            <Cpu className="w-6 h-6 text-teal-400" />
            جزئیات عملیات تولید هوش مصنوعی
          </h1>
          <p className="text-sm text-slate-400 mt-1">{job.id}</p>
        </div>
        
        {job.status === 'failed' && (
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
        title="تلاش مجدد عملیات تولید"
        description="آیا مطمئن هستید که می‌خواهید این عملیات را مجدداً در صف قرار دهید؟"
        isProcessing={retryMutation.isPending}
        onCancel={() => setIsRetryModalOpen(false)}
        onConfirm={() => retryMutation.mutate()}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="glass-panel p-6 rounded-2xl border border-white/5 space-y-4">
          <h2 className="text-lg font-semibold text-white border-b border-white/10 pb-2">اطلاعات پایه</h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-slate-400 flex items-center gap-2">وضعیت</span>
              <AdminStatusBadge status={job.status} />
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400 flex items-center gap-2">نوع</span>
              <span className="text-slate-200 bg-slate-800 px-2 py-1 rounded text-xs">{job.type}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400 flex items-center gap-2">تعداد تلاش مجدد</span>
              <span className="text-slate-200">{job.retryCount || 0}</span>
            </div>
          </div>
        </div>

        <div className="glass-panel p-6 rounded-2xl border border-white/5 space-y-4">
          <h2 className="text-lg font-semibold text-white border-b border-white/10 pb-2">زمان‌بندی</h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400 flex items-center gap-2"><Clock className="w-4 h-4"/> ایجاد</span>
              <span className="text-slate-200" dir="ltr">{new Date(job.createdAt).toLocaleString("fa-IR")}</span>
            </div>
            {job.startedAt && (
              <div className="flex justify-between">
                <span className="text-slate-400 flex items-center gap-2"><Clock className="w-4 h-4"/> شروع</span>
                <span className="text-slate-200" dir="ltr">{new Date(job.startedAt).toLocaleString("fa-IR")}</span>
              </div>
            )}
            {job.completedAt && (
              <div className="flex justify-between">
                <span className="text-slate-400 flex items-center gap-2"><Clock className="w-4 h-4"/> پایان</span>
                <span className="text-slate-200" dir="ltr">{new Date(job.completedAt).toLocaleString("fa-IR")}</span>
              </div>
            )}
            {job.durationMs && (
              <div className="flex justify-between">
                <span className="text-slate-400 flex items-center gap-2"><Clock className="w-4 h-4"/> مدت زمان پردازش</span>
                <span className="text-slate-200" dir="ltr">{(job.durationMs / 1000).toFixed(1)} ثانیه</span>
              </div>
            )}
          </div>
        </div>

        <div className="glass-panel p-6 rounded-2xl border border-white/5 space-y-4 md:col-span-2">
          <h2 className="text-lg font-semibold text-white border-b border-white/10 pb-2">اطلاعات ارتباطی و متادیتا</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            {job.user && (
              <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700/50">
                <div className="flex items-center gap-2 text-slate-400 mb-1"><User className="w-4 h-4"/> کاربر</div>
                <div className="text-slate-200">{job.user.email}</div>
                <div className="text-xs text-slate-500 mt-1">{job.user.id}</div>
              </div>
            )}
            {job.organization && (
              <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700/50">
                <div className="flex items-center gap-2 text-slate-400 mb-1"><Building className="w-4 h-4"/> سازمان</div>
                <div className="text-slate-200">{job.organization.name}</div>
                <div className="text-xs text-slate-500 mt-1">{job.organization.id}</div>
              </div>
            )}
            {job.course && (
              <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700/50">
                <div className="flex items-center gap-2 text-slate-400 mb-1"><Book className="w-4 h-4"/> دوره</div>
                <div className="text-slate-200">{job.course.name || "بدون نام"}</div>
                <div className="text-xs text-slate-500 mt-1">{job.course.id}</div>
              </div>
            )}
            {job.document && (
              <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700/50">
                <div className="flex items-center gap-2 text-slate-400 mb-1"><FileText className="w-4 h-4"/> سند</div>
                <div className="text-slate-200">{job.document.originalName}</div>
                <div className="text-xs text-slate-500 mt-1">{job.document.id}</div>
              </div>
            )}
          </div>
        </div>

        <div className="glass-panel p-6 rounded-2xl border border-white/5 space-y-4">
          <h2 className="text-lg font-semibold text-white border-b border-white/10 pb-2">مدل هوش مصنوعی</h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-slate-400 flex items-center gap-2"><Cpu className="w-4 h-4"/> مدل (Model)</span>
              <span className="text-slate-200 bg-slate-800 px-3 py-1 rounded-lg border border-slate-700 font-mono text-xs">
                {job.model || "نامشخص"}
              </span>
            </div>
          </div>
        </div>

        <div className="glass-panel p-6 rounded-2xl border border-white/5 space-y-4">
          <h2 className="text-lg font-semibold text-white border-b border-white/10 pb-2">مصرف توکن</h2>
          <div className="space-y-3 text-sm">
            {job.totalTokens !== undefined ? (
              <>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 flex items-center gap-2"><Database className="w-4 h-4"/> Input Tokens</span>
                  <span className="text-slate-200">{job.inputTokens?.toLocaleString("en-US") || 0}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 flex items-center gap-2"><Database className="w-4 h-4"/> Output Tokens</span>
                  <span className="text-slate-200">{job.outputTokens?.toLocaleString("en-US") || 0}</span>
                </div>
                <div className="flex justify-between items-center border-t border-white/5 pt-2 mt-2">
                  <span className="text-slate-300 font-medium flex items-center gap-2">Total Tokens</span>
                  <span className="text-teal-400 font-bold">{job.totalTokens?.toLocaleString("en-US") || 0}</span>
                </div>
              </>
            ) : (
              <div className="text-slate-400 text-center py-2">اطلاعات مصرف توکن موجود نیست</div>
            )}
          </div>
        </div>

        <div className="glass-panel p-6 rounded-2xl border border-white/5 space-y-4 md:col-span-2">
          <div className="flex justify-between items-center border-b border-white/10 pb-2">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Code className="w-5 h-5 text-teal-400"/>
              خروجی تولید
            </h2>
            {Boolean(job.payload) && (
              <button
                onClick={() => setPayloadExpanded(!payloadExpanded)}
                className="text-sm text-teal-400 hover:text-teal-300"
              >
                {payloadExpanded ? "کوچک کردن" : "گسترش دادن"}
              </button>
            )}
          </div>
          <div className="text-sm">
            {job.payload ? (
              <div className={`bg-slate-900 rounded-lg border border-slate-700 overflow-x-auto ${payloadExpanded ? "" : "max-h-96 overflow-y-auto"}`}>
                <pre className="p-4 text-slate-300 font-mono text-xs" dir="ltr">
                  {JSON.stringify(job.payload, null, 2)}
                </pre>
              </div>
            ) : (
              <div className="text-slate-400 text-center py-6 bg-slate-900/30 rounded-lg border border-slate-800 border-dashed">
                برای این Job خروجی تولیدی موجود نیست.
              </div>
            )}
          </div>
        </div>

      </div>

      {job.errorMessage && (
        <div className="glass-panel p-6 rounded-2xl border border-red-500/20 bg-red-500/5 space-y-4">
          <h2 className="text-lg font-semibold text-red-400 flex items-center gap-2 border-b border-red-500/10 pb-2">
            <AlertTriangle className="w-5 h-5" />
            خطای پردازش
          </h2>
          <div className="space-y-3 text-sm">
            {job.errorType && (
              <div className="flex justify-between">
                <span className="text-red-400/70">نوع خطا</span>
                <span className="text-red-300 font-mono text-xs bg-red-500/10 px-2 py-1 rounded">{job.errorType}</span>
              </div>
            )}
            <div>
              <span className="text-red-400/70 block mb-1">پیام خطا</span>
              <p className="text-red-300 font-mono text-xs bg-red-500/10 p-3 rounded leading-relaxed whitespace-pre-wrap" dir="ltr">
                {job.errorMessage}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
