import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api, type AdminGenerationDetail } from "../../lib/api/admin";
import { useAdmin } from "../../hooks/useAdmin.js";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AdminStatusBadge, AdminConfirmModal } from "../../components/admin/AdminUI.js";
import { toPersianDigits } from "@avana/domain";
import { ArrowRight, Cpu, Clock, AlertTriangle, RefreshCw, User, Building, Book, FileText, Database, Code, Download, Loader2, Layers, Wallet, CreditCard, RotateCcw, CheckCircle2, AlertCircle, Coins } from "lucide-react";

const SOURCE_ROLE_LABELS: Record<string, { label: string; className: string }> = {
  primary_notes: {
    label: "جزوه اصلی (مسیر تدریس)",
    className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  },
  question_template: {
    label: "قالب نمونه سؤال",
    className: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  },
  primary_reference: {
    label: "منبع مرجع اصلی",
    className: "bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/20",
  },
  supplementary_reference: {
    label: "منبع تکمیلی",
    className: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  },
};

function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${toPersianDigits(bytes)} بایت`;
  if (bytes < 1024 * 1024) return `${toPersianDigits((bytes / 1024).toFixed(1))} کیلوبایت`;
  return `${toPersianDigits((bytes / (1024 * 1024)).toFixed(1))} مگابایت`;
}

export function AdminGenerationDetailPage() {
  const { id } = useParams();
  const adminApi = useAdmin();
  const [job, setJob] = useState<AdminGenerationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payloadExpanded, setPayloadExpanded] = useState(false);
  const [downloadingDocId, setDownloadingDocId] = useState<string | null>(null);

  const handleDownload = async (docId: string, fallbackName?: string) => {
    try {
      setDownloadingDocId(docId);
      await adminApi.downloadDocument(docId, fallbackName);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "خطا در دانلود فایل";
      alert(msg);
    } finally {
      setDownloadingDocId(null);
    }
  };

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
              <span className="text-[var(--color-text)]">{toPersianDigits(job.retryCount || 0)}</span>
            </div>
          </div>
        </div>

        <div className="bg-[var(--color-surface)] p-6 rounded-2xl border border-[var(--color-border)] shadow-sm space-y-4">
          <h2 className="text-base font-bold text-[var(--color-text)] border-b border-[var(--color-border)] pb-2">زمان‌بندی</h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-[var(--color-text-muted)] flex items-center gap-2"><Clock className="w-4 h-4"/> ایجاد</span>
              <span className="text-[var(--color-text)]" dir="ltr">{toPersianDigits(new Date(job.createdAt).toLocaleString("fa-IR"))}</span>
            </div>
            {job.startedAt && (
              <div className="flex justify-between">
                <span className="text-[var(--color-text-muted)] flex items-center gap-2"><Clock className="w-4 h-4"/> شروع</span>
                <span className="text-[var(--color-text)]" dir="ltr">{toPersianDigits(new Date(job.startedAt).toLocaleString("fa-IR"))}</span>
              </div>
            )}
            {job.completedAt && (
              <div className="flex justify-between">
                <span className="text-[var(--color-text-muted)] flex items-center gap-2"><Clock className="w-4 h-4"/> پایان</span>
                <span className="text-[var(--color-text)]" dir="ltr">{toPersianDigits(new Date(job.completedAt).toLocaleString("fa-IR"))}</span>
              </div>
            )}
            {job.durationMs && (
              <div className="flex justify-between">
                <span className="text-[var(--color-text-muted)] flex items-center gap-2"><Clock className="w-4 h-4"/> مدت زمان پردازش</span>
                <span className="text-[var(--color-text)]" dir="ltr">{toPersianDigits((job.durationMs / 1000).toFixed(1))} ثانیه</span>
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
              <div className="bg-[var(--color-surface-warm)]/60 p-3.5 rounded-xl border border-[var(--color-border)] flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-2 text-[var(--color-text-muted)] mb-1">
                    <span className="flex items-center gap-1.5"><FileText className="w-4 h-4"/> سند ورودی</span>
                    {job.document.sizeBytes ? (
                      <span className="text-xs text-[var(--color-text-muted)]">{formatFileSize(job.document.sizeBytes)}</span>
                    ) : null}
                  </div>
                  <div className="text-[var(--color-text)] font-semibold truncate" title={job.document.originalName}>
                    {job.document.originalName}
                  </div>
                  <div className="text-xs text-[var(--color-text-muted)] mt-1 font-mono truncate" dir="ltr">
                    {job.document.id}
                  </div>
                </div>
                {job.document.id && job.document.id !== "__unknown__" && (
                  <div className="mt-3 pt-2 border-t border-[var(--color-border)]">
                    <button
                      type="button"
                      onClick={() => handleDownload(job.document!.id, job.document!.originalName)}
                      disabled={downloadingDocId === job.document.id}
                      className="w-full flex items-center justify-center gap-2 bg-[var(--color-surface)] hover:bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-[var(--color-primary-default)] px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                    >
                      {downloadingDocId === job.document.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Download className="w-3.5 h-3.5" />
                      )}
                      دانلود فایل اصلی
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* User Payment for this Operation */}
        <div className="bg-[var(--color-surface)] p-6 rounded-2xl border border-[var(--color-border)] shadow-sm space-y-4 md:col-span-2">
          <div className="flex justify-between items-center border-b border-[var(--color-border)] pb-2">
            <h2 className="text-base font-bold text-[var(--color-text)] flex items-center gap-2">
              <Wallet className="w-5 h-5 text-[var(--color-primary-default)]" />
              هزینه کسرشده از کیف پول کاربر بابت این عملیات
            </h2>
            {job.userCost?.status && (
              <span
                className={`px-3 py-1 rounded-full text-xs font-semibold ${
                  job.userCost.status === "debited"
                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20"
                    : job.userCost.status === "refunded"
                      ? "bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-500/20"
                      : job.userCost.status === "free"
                        ? "bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20"
                        : "bg-[var(--color-surface-warm)] text-[var(--color-text-muted)] border border-[var(--color-border)]"
                }`}
              >
                {job.userCost.statusLabel}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div className="bg-[var(--color-surface-warm)]/60 p-4 rounded-xl border border-[var(--color-border)]">
              <div className="flex items-center gap-2 text-[var(--color-text-muted)] mb-1 text-xs">
                <CreditCard className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                مبلغ کسرشده اولیه
              </div>
              <div className="text-lg font-bold text-[var(--color-text)]">
                {job.userCost?.isAvailable
                  ? job.userCost.isFree
                    ? "رایگان (۰ تومان)"
                    : `${toPersianDigits((job.userCost.chargedAmountToman || 0).toLocaleString("fa-IR"))} تومان`
                  : "اطلاعات در دسترس نیست"}
              </div>
            </div>

            <div className="bg-[var(--color-surface-warm)]/60 p-4 rounded-xl border border-[var(--color-border)]">
              <div className="flex items-center gap-2 text-[var(--color-text-muted)] mb-1 text-xs">
                <RotateCcw className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                مبلغ بازپرداخت‌شده
              </div>
              <div className="text-lg font-bold text-[var(--color-text)]">
                {job.userCost?.isAvailable
                  ? (job.userCost.refundedAmountToman || 0) > 0
                    ? `${toPersianDigits((job.userCost.refundedAmountToman || 0).toLocaleString("fa-IR"))} تومان`
                    : "۰ تومان"
                  : "اطلاعات در دسترس نیست"}
              </div>
            </div>

            <div className="bg-[var(--color-surface-warm)]/60 p-4 rounded-xl border border-[var(--color-border)]">
              <div className="flex items-center gap-2 text-[var(--color-text-muted)] mb-1 text-xs">
                <Coins className="w-4 h-4 text-[var(--color-primary-default)]" />
                مبلغ خالص پرداخت‌شده
              </div>
              <div className="text-lg font-bold text-[var(--color-primary-default)]">
                {job.userCost?.isAvailable
                  ? job.userCost.isFree
                    ? "رایگان (۰ تومان)"
                    : `${toPersianDigits((job.userCost.netPaidAmountToman || 0).toLocaleString("fa-IR"))} تومان`
                  : "اطلاعات در دسترس نیست"}
              </div>
            </div>
          </div>
        </div>

        {/* File Financial Summary Card */}
        {job.fileFinancialSummary && (
          <div className="bg-[var(--color-surface)] p-6 rounded-2xl border border-[var(--color-border)] shadow-sm space-y-5 md:col-span-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--color-border)] pb-3">
              <div>
                <h2 className="text-base font-bold text-[var(--color-text)] flex items-center gap-2">
                  <FileText className="w-5 h-5 text-[var(--color-primary-default)]" />
                  مجموع هزینه و سوابق مالی فایل منبع
                </h2>
                <p className="text-xs text-[var(--color-text-muted)] mt-1 truncate" title={job.fileFinancialSummary.documentName}>
                  سند: <span className="font-semibold text-[var(--color-text)]">{job.fileFinancialSummary.documentName}</span>
                </p>
              </div>

              <div>
                {job.fileFinancialSummary.isComplete ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    سوابق مالی کامل
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
                    <AlertCircle className="w-3.5 h-3.5" />
                    سوابق مالی برخی عملیات ناقص است
                  </span>
                )}
              </div>
            </div>

            {!job.fileFinancialSummary.isComplete && (
              <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-xl text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  توجه: سوابق مالی یک یا چند عملیات این فایل در دسترس نیست. مبلغ خالص نمایش‌داده‌شده، حداقل مجموع به‌دست‌آمده از روی تراکنش‌های ثبت‌شده معتبر است.
                </span>
              </div>
            )}

            {/* Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div className="bg-[var(--color-surface-warm)]/60 p-3.5 rounded-xl border border-[var(--color-border)]">
                <div className="text-xs text-[var(--color-text-muted)] mb-1">تعداد عملیات‌های فایل</div>
                <div className="text-base font-bold text-[var(--color-text)]">
                  {toPersianDigits(job.fileFinancialSummary.totalOperationsCount)} عملیات
                </div>
              </div>

              <div className="bg-[var(--color-surface-warm)]/60 p-3.5 rounded-xl border border-[var(--color-border)]">
                <div className="text-xs text-[var(--color-text-muted)] mb-1">مجموع کسرشده</div>
                <div className="text-base font-bold text-[var(--color-text)]">
                  {toPersianDigits(job.fileFinancialSummary.totalDebitedToman.toLocaleString("fa-IR"))} تومان
                </div>
              </div>

              <div className="bg-[var(--color-surface-warm)]/60 p-3.5 rounded-xl border border-[var(--color-border)]">
                <div className="text-xs text-[var(--color-text-muted)] mb-1">مجموع بازپرداخت‌ها</div>
                <div className="text-base font-bold text-purple-700 dark:text-purple-400">
                  {toPersianDigits(job.fileFinancialSummary.totalRefundedToman.toLocaleString("fa-IR"))} تومان
                </div>
              </div>

              <div className="bg-[var(--color-primary-default)]/10 p-3.5 rounded-xl border border-[var(--color-primary-default)]/20">
                <div className="text-xs text-[var(--color-primary-default)] font-medium mb-1">مجموع نهایی پرداختی فایل</div>
                <div className="text-base font-extrabold text-[var(--color-primary-default)]">
                  {toPersianDigits(job.fileFinancialSummary.totalNetPaidToman.toLocaleString("fa-IR"))} تومان
                </div>
              </div>
            </div>

            {/* Operations Breakdown Table */}
            {job.fileFinancialSummary.operations.length > 0 && (
              <div className="space-y-2 pt-2">
                <h3 className="text-xs font-bold text-[var(--color-text-muted)]">تفکیک عملیات‌های مرتبط با این فایل:</h3>
                <div className="overflow-x-auto rounded-xl border border-[var(--color-border)]">
                  <table className="w-full text-xs text-right">
                    <thead className="bg-[var(--color-surface-warm)] text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
                      <tr>
                        <th className="p-3">عملیات</th>
                        <th className="p-3">نوع</th>
                        <th className="p-3">وضعیت</th>
                        <th className="p-3">تاریخ</th>
                        <th className="p-3">مبلغ کسرشده</th>
                        <th className="p-3">بازپرداخت</th>
                        <th className="p-3">پرداختی نهایی</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-border)] bg-[var(--color-surface)]">
                      {job.fileFinancialSummary.operations.map((op) => {
                        const isCurrent = op.jobId === job.id;
                        return (
                          <tr key={op.jobId} className={`hover:bg-[var(--color-surface-warm)]/40 transition-colors ${isCurrent ? "bg-[var(--color-surface-warm)]/60 font-semibold" : ""}`}>
                            <td className="p-3">
                              {isCurrent ? (
                                <span className="text-[var(--color-primary-default)]">همین عملیات (جاری)</span>
                              ) : (
                                <Link to={`/admin/generation/${op.jobId}`} className="text-[var(--color-primary-default)] hover:underline font-mono text-[11px]" dir="ltr">
                                  {op.jobId.slice(0, 8)}...
                                </Link>
                              )}
                            </td>
                            <td className="p-3">
                              <span className="bg-[var(--color-surface-warm)] px-2 py-0.5 rounded text-[11px] border border-[var(--color-border)]">{op.type}</span>
                            </td>
                            <td className="p-3">
                              <AdminStatusBadge status={op.status} />
                            </td>
                            <td className="p-3 text-[var(--color-text-muted)]" dir="ltr">
                              {toPersianDigits(new Date(op.createdAt).toLocaleDateString("fa-IR"))}
                            </td>
                            <td className="p-3 text-[var(--color-text)]">
                              {op.userCost.isAvailable
                                ? op.userCost.isFree
                                  ? "رایگان"
                                  : `${toPersianDigits((op.userCost.chargedAmountToman || 0).toLocaleString("fa-IR"))} تومان`
                                : "نامشخص"}
                            </td>
                            <td className="p-3 text-purple-700 dark:text-purple-400">
                              {op.userCost.isAvailable && (op.userCost.refundedAmountToman || 0) > 0
                                ? `${toPersianDigits((op.userCost.refundedAmountToman || 0).toLocaleString("fa-IR"))} تومان`
                                : "-"}
                            </td>
                            <td className="p-3 font-bold text-[var(--color-text)]">
                              {op.userCost.isAvailable
                                ? op.userCost.isFree
                                  ? "رایگان"
                                  : `${toPersianDigits((op.userCost.netPaidAmountToman || 0).toLocaleString("fa-IR"))} تومان`
                                : "اطلاعات در دسترس نیست"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {job.sources && job.sources.length > 0 && (
          <div className="bg-[var(--color-surface)] p-6 rounded-2xl border border-[var(--color-border)] shadow-sm space-y-4 md:col-span-2">
            <div className="flex justify-between items-center border-b border-[var(--color-border)] pb-2">
              <h2 className="text-base font-bold text-[var(--color-text)] flex items-center gap-2">
                <Layers className="w-5 h-5 text-[var(--color-primary-default)]" />
                منابع ورودی پکیج (Source Pack Documents)
              </h2>
              <span className="text-xs text-[var(--color-text-muted)]">
                {toPersianDigits(job.sources.length)} منبع
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {job.sources.map((src) => {
                const roleInfo = SOURCE_ROLE_LABELS[src.role] || {
                  label: src.role,
                  className: "bg-[var(--color-surface-warm)] text-[var(--color-text-muted)] border-[var(--color-border)]",
                };
                return (
                  <div
                    key={src.documentId}
                    className="bg-[var(--color-surface-warm)]/60 p-3.5 rounded-xl border border-[var(--color-border)] flex flex-col justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium border ${roleInfo.className}`}>
                          {roleInfo.label}
                        </span>
                        {src.sizeBytes ? (
                          <span className="text-xs text-[var(--color-text-muted)]">
                            {formatFileSize(src.sizeBytes)}
                          </span>
                        ) : null}
                      </div>
                      <div className="text-[var(--color-text)] font-semibold text-sm truncate" title={src.originalName}>
                        {src.originalName}
                      </div>
                      <div className="text-xs text-[var(--color-text-muted)] mt-1 font-mono truncate" dir="ltr">
                        {src.documentId}
                      </div>
                    </div>
                    {src.documentId && src.documentId !== "__unknown__" && (
                      <button
                        type="button"
                        onClick={() => handleDownload(src.documentId, src.originalName)}
                        disabled={downloadingDocId === src.documentId}
                        className="flex items-center justify-center gap-2 bg-[var(--color-surface)] hover:bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-[var(--color-primary-default)] px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                      >
                        {downloadingDocId === src.documentId ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Download className="w-3.5 h-3.5" />
                        )}
                        دانلود فایل
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

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
                  <span className="text-[var(--color-text)] font-mono">{toPersianDigits(job.inputTokens?.toLocaleString("fa-IR") || 0)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[var(--color-text-muted)] flex items-center gap-2"><Database className="w-4 h-4"/> Output Tokens</span>
                  <span className="text-[var(--color-text)] font-mono">{toPersianDigits(job.outputTokens?.toLocaleString("fa-IR") || 0)}</span>
                </div>
                <div className="flex justify-between items-center border-t border-[var(--color-border)] pt-2 mt-2">
                  <span className="text-[var(--color-text)] font-semibold flex items-center gap-2">Total Tokens</span>
                  <span className="text-[var(--color-primary-default)] font-bold font-mono">{toPersianDigits(job.totalTokens?.toLocaleString("fa-IR") || 0)}</span>
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
