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
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "خطای ناشناخته";
      alert("خطا در تلاش مجدد: " + msg);
    }
  });

  useEffect(() => {
    const fetch = async () => {
      try {
        const res = await api.get<AdminGenerationDetail>(`/admin/generation/${id}`);
        setJob(res);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "خطا در دریافت جزئیات Job");
      } finally {
        setLoading(false);
      }
    };
    if (id) fetch();
  }, [id]);

  if (loading) return <div className="text-[var(--color-text-muted)]">در حال بارگذاری...</div>;
  if (error) return <div className="text-rose-600 dark:text-rose-400">{error}</div>;
  if (!job) return <div className="text-[var(--color-text-muted)]">Job یافت نشد.</div>;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-4">
        <Link to="/admin/generation" className="p-2 bg-[var(--color-surface-warm)] rounded-xl hover:bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)] transition-colors">
          <ArrowRight className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[var(--color-text)] flex items-center gap-3">
            <Cpu className="w-6 h-6 text-[var(--color-primary-default)]" />
            جزئیات عملیات تولید هوش مصنوعی
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1 font-mono" dir="ltr">{job.id}</p>
        </div>
        
        {job.status === 'failed' && (
          <button 
            onClick={() => setIsRetryModalOpen(true)}
            className="me-auto flex items-center gap-2 bg-[var(--color-surface-warm)] hover:bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)] px-4 py-2 rounded-xl text-sm font-semibold transition-colors"
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
        <div className="bg-[var(--color-surface)] p-6 rounded-2xl border border-[var(--color-border)] shadow-sm space-y-4">
          <h2 className="text-base font-bold text-[var(--color-text)] border-b border-[var(--color-border)] pb-2">اطلاعات پایه</h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-[var(--color-text-muted)] flex items-center gap-2">وضعیت</span>
              <AdminStatusBadge status={job.status} />
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--color-text-muted)] flex items-center gap-2">نوع</span>
              <span className="text-[var(--color-text)] bg-[var(--color-surface-warm)] border border-[var(--color-border)] px-2 py-0.5 rounded-lg text-xs">{job.type}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--color-text-muted)] flex items-center gap-2">تعداد تلاش مجدد</span>
              <span className="text-[var(--color-text)]">{job.retryCount || 0}</span>
            </div>
          </div>
        </div>

        <div className="bg-[var(--color-surface)] p-6 rounded-2xl border border-[var(--color-border)] shadow-sm space-y-4">
          <h2 className="text-base font-bold text-[var(--color-text)] border-b border-[var(--color-border)] pb-2">زمان‌بندی</h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-[var(--color-text-muted)] flex items-center gap-2"><Clock className="w-4 h-4"/> ایجاد</span>
              <span className="text-[var(--color-text)]" dir="ltr">{new Date(job.createdAt).toLocaleString("fa-IR")}</span>
            </div>
            {job.startedAt && (
              <div className="flex justify-between">
                <span className="text-[var(--color-text-muted)] flex items-center gap-2"><Clock className="w-4 h-4"/> شروع</span>
                <span className="text-[var(--color-text)]" dir="ltr">{new Date(job.startedAt).toLocaleString("fa-IR")}</span>
              </div>
            )}
            {job.completedAt && (
              <div className="flex justify-between">
                <span className="text-[var(--color-text-muted)] flex items-center gap-2"><Clock className="w-4 h-4"/> پایان</span>
                <span className="text-[var(--color-text)]" dir="ltr">{new Date(job.completedAt).toLocaleString("fa-IR")}</span>
              </div>
            )}
            {job.durationMs && (
              <div className="flex justify-between">
                <span className="text-[var(--color-text-muted)] flex items-center gap-2"><Clock className="w-4 h-4"/> مدت زمان پردازش</span>
                <span className="text-[var(--color-text)]" dir="ltr">{(job.durationMs / 1000).toFixed(1)} ثانیه</span>
              </div>
            )}
          </div>
        </div>

        <div className="bg-[var(--color-surface)] p-6 rounded-2xl border border-[var(--color-border)] shadow-sm space-y-4 md:col-span-2">
          <h2 className="text-base font-bold text-[var(--color-text)] border-b border-[var(--color-border)] pb-2">اطلاعات ارتباطی و متادیتا</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            {job.user && (
              <div className="bg-[var(--color-surface-warm)]/60 p-3.5 rounded-xl border border-[var(--color-border)]">
                <div className="flex items-center gap-2 text-[var(--color-text-muted)] mb-1"><User className="w-4 h-4"/> کاربر</div>
                <div className="text-[var(--color-text)] font-semibold">{job.user.email}</div>
                <div className="text-xs text-[var(--color-text-muted)] mt-1 font-mono" dir="ltr">{job.user.id}</div>
              </div>
            )}
            {job.organization && (
              <div className="bg-[var(--color-surface-warm)]/60 p-3.5 rounded-xl border border-[var(--color-border)]">
                <div className="flex items-center gap-2 text-[var(--color-text-muted)] mb-1"><Building className="w-4 h-4"/> سازمان</div>
                <div className="text-[var(--color-text)] font-semibold">{job.organization.name}</div>
                <div className="text-xs text-[var(--color-text-muted)] mt-1 font-mono" dir="ltr">{job.organization.id}</div>
              </div>
            )}
            {job.course && (
              <div className="bg-[var(--color-surface-warm)]/60 p-3.5 rounded-xl border border-[var(--color-border)]">
                <div className="flex items-center gap-2 text-[var(--color-text-muted)] mb-1"><Book className="w-4 h-4"/> دوره</div>
                <div className="text-[var(--color-text)] font-semibold">{job.course.name || "بدون نام"}</div>
                <div className="text-xs text-[var(--color-text-muted)] mt-1 font-mono" dir="ltr">{job.course.id}</div>
              </div>
            )}
            {job.document && (
              <div className="bg-[var(--color-surface-warm)]/60 p-3.5 rounded-xl border border-[var(--color-border)]">
                <div className="flex items-center gap-2 text-[var(--color-text-muted)] mb-1"><FileText className="w-4 h-4"/> سند</div>
                <div className="text-[var(--color-text)] font-semibold">{job.document.originalName}</div>
                <div className="text-xs text-[var(--color-text-muted)] mt-1 font-mono" dir="ltr">{job.document.id}</div>
              </div>
            )}
          </div>
        </div>

        <div className="bg-[var(--color-surface)] p-6 rounded-2xl border border-[var(--color-border)] shadow-sm space-y-4">
          <h2 className="text-base font-bold text-[var(--color-text)] border-b border-[var(--color-border)] pb-2">مدل هوش مصنوعی</h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-[var(--color-text-muted)] flex items-center gap-2"><Cpu className="w-4 h-4"/> مدل (Model)</span>
              <span className="text-[var(--color-text)] bg-[var(--color-surface-warm)] px-3 py-1 rounded-lg border border-[var(--color-border)] font-mono text-xs" dir="ltr">
                {job.model || "نامشخص"}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-[var(--color-surface)] p-6 rounded-2xl border border-[var(--color-border)] shadow-sm space-y-4">
          <h2 className="text-base font-bold text-[var(--color-text)] border-b border-[var(--color-border)] pb-2">مصرف توکن</h2>
          <div className="space-y-3 text-sm">
            {job.totalTokens !== undefined ? (
              <>
                <div className="flex justify-between items-center">
                  <span className="text-[var(--color-text-muted)] flex items-center gap-2"><Database className="w-4 h-4"/> Input Tokens</span>
                  <span className="text-[var(--color-text)] font-mono">{job.inputTokens?.toLocaleString("en-US") || 0}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[var(--color-text-muted)] flex items-center gap-2"><Database className="w-4 h-4"/> Output Tokens</span>
                  <span className="text-[var(--color-text)] font-mono">{job.outputTokens?.toLocaleString("en-US") || 0}</span>
                </div>
                <div className="flex justify-between items-center border-t border-[var(--color-border)] pt-2 mt-2">
                  <span className="text-[var(--color-text)] font-semibold flex items-center gap-2">Total Tokens</span>
                  <span className="text-[var(--color-primary-default)] font-bold font-mono">{job.totalTokens?.toLocaleString("en-US") || 0}</span>
                </div>
              </>
            ) : (
              <div className="text-[var(--color-text-muted)] text-center py-2 text-xs">اطلاعات مصرف توکن موجود نیست</div>
            )}
          </div>
        </div>

        <div className="bg-[var(--color-surface)] p-6 rounded-2xl border border-[var(--color-border)] shadow-sm space-y-4 md:col-span-2">
          <div className="flex justify-between items-center border-b border-[var(--color-border)] pb-2">
            <h2 className="text-base font-bold text-[var(--color-text)] flex items-center gap-2">
              <Code className="w-5 h-5 text-[var(--color-primary-default)]"/>
              خروجی تولید
            </h2>
            {Boolean(job.payload) && (
              <button
                onClick={() => setPayloadExpanded(!payloadExpanded)}
                className="text-sm text-[var(--color-primary-default)] hover:underline"
              >
                {payloadExpanded ? "کوچک کردن" : "گسترش دادن"}
              </button>
            )}
          </div>
          <div className="text-sm">
            {job.payload ? (
              <div className={`bg-[var(--color-surface-warm)] rounded-xl border border-[var(--color-border)] overflow-x-auto ${payloadExpanded ? "" : "max-h-96 overflow-y-auto"}`}>
                <pre className="p-4 text-[var(--color-text)] font-mono text-xs" dir="ltr">
                  {JSON.stringify(job.payload, null, 2)}
                </pre>
              </div>
            ) : (
              <div className="text-[var(--color-text-muted)] text-center py-6 bg-[var(--color-surface-warm)]/40 rounded-xl border border-[var(--color-border)] border-dashed">
                برای این Job خروجی تولیدی موجود نیست.
              </div>
            )}
          </div>
        </div>

      </div>

      {job.errorMessage && (
        <div className="bg-rose-500/10 p-6 rounded-2xl border border-rose-500/20 space-y-4">
          <h2 className="text-base font-bold text-rose-700 dark:text-rose-300 flex items-center gap-2 border-b border-rose-500/20 pb-2">
            <AlertTriangle className="w-5 h-5" />
            خطای پردازش
          </h2>
          <div className="space-y-3 text-sm">
            {job.errorType && (
              <div className="flex justify-between">
                <span className="text-rose-700/80 dark:text-rose-300/80">نوع خطا</span>
                <span className="text-rose-700 dark:text-rose-300 font-mono text-xs bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded" dir="ltr">{job.errorType}</span>
              </div>
            )}
            <div>
              <span className="text-rose-700/80 dark:text-rose-300/80 block mb-1">پیام خطا</span>
              <p className="text-rose-800 dark:text-rose-200 font-mono text-xs bg-[var(--color-surface)] border border-rose-500/20 p-3 rounded-xl leading-relaxed whitespace-pre-wrap" dir="ltr">
                {job.errorMessage}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
