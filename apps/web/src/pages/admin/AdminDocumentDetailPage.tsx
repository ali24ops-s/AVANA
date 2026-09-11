import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api } from "../../lib/api/admin";
import { useAdmin } from "../../hooks/useAdmin.js";
import { useMutation } from "@tanstack/react-query";
import { AdminStatusBadge, AdminConfirmModal } from "../../components/admin/AdminUI";
import { toPersianDigits } from "@avana/domain";
import {
  ArrowRight,
  FileText,
  HardDrive,
  User,
  Calendar,
  AlertTriangle,
  RefreshCw,
  Download,
  Trash2,
  Sparkles,
  CheckCircle2,
  Clock,
  Activity,
  AlertCircle,
  Loader2,
  BookOpen,
  Layers,
  HelpCircle,
  FileCode,
  ShieldCheck,
  Send,
  Cpu,
} from "lucide-react";

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

interface DocumentDetail {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  status: string;
  createdAt: string;
  courseName?: string;
  ownerEmail?: string;
  errorCode?: string | null;
  retryCount?: number;
  generationProgress?: DocumentGenerationProgress | null;
}

interface PipelineStageDef {
  id: string;
  label: string;
  description: string;
  icon: typeof Sparkles;
}

const PIPELINE_STAGES: PipelineStageDef[] = [
  { id: "analysis", label: "تحلیل سند", description: "استخراج متن و ساختاردهی چانک‌ها", icon: FileCode },
  { id: "planning", label: "برنامه‌ریزی", description: "طراحی سرفصل‌ها و نقشه یادگیری", icon: Layers },
  { id: "lesson", label: "تولید جلسات", description: "تولید محتوای متنی و تمرین‌ها", icon: BookOpen },
  { id: "flashcard", label: "تولید فلش‌کارت", description: "استخراج مفاهیم کلیدی و مرور", icon: Sparkles },
  { id: "quiz", label: "تولید آزمون‌ها", description: "طراحی سوالات تستی و تشریحی", icon: HelpCircle },
  { id: "summary", label: "خلاصه دوره", description: "جمع‌بندی سرفصل‌ها و نقشه ذهنی", icon: FileText },
  { id: "review", label: "بازبینی و ارزیابی", description: "بررسی کیفیت محتوا و رفع ابهام", icon: ShieldCheck },
  { id: "publishing", label: "انتشار", description: "آماده‌سازی نهایی و انتشار دوره", icon: Send },
];

export function AdminDocumentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
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
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "خطای ناشناخته";
      alert("خطا در تلاش مجدد: " + msg);
    }
  });

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error("No ID");
      return adminApi.deleteDocument(id);
    },
    onSuccess: () => {
      setIsDeleteModalOpen(false);
      navigate("/admin/documents");
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "خطای ناشناخته";
      alert("خطا در حذف فایل: " + msg);
    }
  });

  const handleDownload = () => {
    if (!id) return;
    const url = adminApi.getDownloadUrl(id);
    const a = window.document.createElement("a");
    a.href = url;
    a.download = doc?.originalName || "document";
    window.document.body.appendChild(a);
    a.click();
    window.document.body.removeChild(a);
  };

  useEffect(() => {
    const fetchDoc = async () => {
      try {
        const res = await api.get<DocumentDetail>(`/admin/documents/${id}`);
        setDoc(res);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "خطا در دریافت جزئیات فایل");
      } finally {
        setLoading(false);
      }
    };
    if (id) fetchDoc();
  }, [id]);

  // Live polling when generation is active
  useEffect(() => {
    if (!id) return;
    const progStatus = doc?.generationProgress?.status;
    const isGenerating =
      progStatus === "generating" ||
      progStatus === "planning" ||
      progStatus === "reviewing" ||
      progStatus === "queued" ||
      doc?.status === "generating" ||
      doc?.status === "extracting";

    if (!isGenerating) return;

    const interval = setInterval(async () => {
      try {
        const res = await api.get<DocumentDetail>(`/admin/documents/${id}`);
        setDoc(res);
      } catch {
        // silent polling error
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [id, doc?.status, doc?.generationProgress?.status]);

  if (loading) return <div className="text-[var(--color-text-muted)] py-12 text-center" dir="rtl">در حال بارگذاری...</div>;
  if (error) return <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-sm text-rose-600 dark:text-rose-400" dir="rtl">{error}</div>;
  if (!doc) return <div className="text-[var(--color-text-muted)] py-12 text-center" dir="rtl">فایل یافت نشد.</div>;

  const prog = doc.generationProgress;
  const progressStatus = prog?.status ?? (
    doc.status === "generating" ? "generating" :
    doc.status === "review_pending" ? "reviewing" :
    doc.status === "ready" ? "completed" :
    doc.status === "failed" ? "failed" : "idle"
  );

  const currentStageId = prog?.stage ?? (
    doc.status === "generating" ? "lesson" :
    doc.status === "review_pending" ? "review" :
    doc.status === "extracting" ? "analysis" : null
  );

  const getStageState = (stageId: string): "completed" | "active" | "queued" | "failed" | "upcoming" => {
    const stageIndex = PIPELINE_STAGES.findIndex(s => s.id === stageId);
    const currentStageIndex = PIPELINE_STAGES.findIndex(s => s.id === currentStageId);

    if (progressStatus === "completed" || doc.status === "ready") {
      return "completed";
    }

    if (progressStatus === "failed") {
      if (currentStageIndex === -1) return stageIndex === 0 ? "failed" : "upcoming";
      if (stageIndex < currentStageIndex) return "completed";
      if (stageIndex === currentStageIndex) return "failed";
      return "upcoming";
    }

    if (progressStatus === "idle") {
      return "upcoming";
    }

    if (progressStatus === "queued") {
      return stageIndex === 0 ? "queued" : "upcoming";
    }

    if (currentStageIndex >= 0) {
      if (stageIndex < currentStageIndex) return "completed";
      if (stageIndex === currentStageIndex) return "active";
      return "upcoming";
    }

    if (progressStatus === "planning") {
      if (stageIndex < 1) return "completed";
      if (stageIndex === 1) return "active";
      return "upcoming";
    }
    if (progressStatus === "reviewing") {
      if (stageIndex < 6) return "completed";
      if (stageIndex === 6) return "active";
      return "upcoming";
    }

    return "upcoming";
  };

  const isStale = Boolean(
    prog?.lastActivityAt &&
    (progressStatus === "generating" || progressStatus === "planning" || progressStatus === "reviewing") &&
    Date.now() - new Date(prog.lastActivityAt).getTime() > 5 * 60 * 1000
  );

  return (
    <div className="space-y-6 max-w-5xl" dir="rtl">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/admin/documents" className="p-2.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl hover:bg-[var(--color-surface-warm)] text-[var(--color-text)] transition-colors shadow-sm" aria-label="بازگشت به لیست اسناد">
          <ArrowRight className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)] flex items-center gap-3">
            <FileText className="w-6 h-6 text-[var(--color-primary-default)]" />
            جزئیات فایل و خط لوله هوش مصنوعی
          </h1>
          <p className="text-xs font-mono text-[var(--color-text-muted)] mt-1" dir="ltr">{doc.id}</p>
        </div>
        
        {(doc.status === 'failed' || doc.status === 'error' || progressStatus === 'failed') && (
          <button 
            onClick={() => setIsRetryModalOpen(true)}
            className="flex items-center gap-2 bg-[var(--color-surface)] hover:bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-[var(--color-text)] px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium transition-colors shadow-sm cursor-pointer"
          >
            <RefreshCw className="w-4 h-4 text-[var(--color-primary-default)]" />
            تلاش مجدد
          </button>
        )}
        <button 
          onClick={handleDownload}
          className="flex items-center gap-2 bg-[var(--color-surface)] hover:bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-[var(--color-text)] px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium transition-colors shadow-sm cursor-pointer"
        >
          <Download className="w-4 h-4 text-[var(--color-primary-default)]" />
          دانلود فایل
        </button>
        <button 
          onClick={() => setIsDeleteModalOpen(true)}
          className="flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium transition-colors shadow-sm cursor-pointer ms-auto"
        >
          <Trash2 className="w-4 h-4" />
          حذف سند
        </button>
      </div>

      <AdminConfirmModal
        isOpen={isRetryModalOpen}
        title="تلاش مجدد پردازش فایل"
        description="آیا مطمئن هستید که می‌خواهید پردازش این فایل را مجدداً تلاش کنید؟ این کار باعث شروع دوباره فرآیند استخراج متن می‌شود."
        isProcessing={retryMutation.isPending}
        onCancel={() => setIsRetryModalOpen(false)}
        onConfirm={() => retryMutation.mutate()}
      />

      <AdminConfirmModal
        isOpen={isDeleteModalOpen}
        title="حذف سند"
        description="آیا از حذف این سند اطمینان دارید؟ با حذف فایل، تمامی چانک‌ها و اطلاعات استخراج شده مرتبط با آن نیز حذف خواهند شد. این عملیات قابل بازگشت نیست."
        isProcessing={deleteMutation.isPending}
        onCancel={() => setIsDeleteModalOpen(false)}
        onConfirm={() => deleteMutation.mutate()}
      />

      {/* Stale Activity Warning */}
      {isStale && (
        <div className="bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-200 p-4 rounded-2xl flex items-start gap-3 shadow-sm">
          <Clock className="w-5 h-5 mt-0.5 shrink-0 animate-pulse text-amber-600 dark:text-amber-400" />
          <div>
            <h3 className="font-semibold text-amber-800 dark:text-amber-200">عدم دریافت فعالیت در ۵ دقیقه اخیر</h3>
            <p className="text-sm mt-1 leading-relaxed opacity-90">
              خط لوله تولید در وضعیت فعال است اما بیش از ۵ دقیقه سیگنال فعالیتی ثبت نکرده است. این وضعیت معمولاً به دلیل صف درخواست مدل هوش مصنوعی یا پردازش فایل‌های سنگین رخ می‌دهد.
            </p>
          </div>
        </div>
      )}

      {/* Error Alert */}
      {(doc.errorCode || prog?.error) && (
        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-300 p-4 rounded-2xl flex items-start gap-3 shadow-sm">
          <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0 text-rose-600 dark:text-rose-400" />
          <div>
            <h3 className="font-semibold text-rose-700 dark:text-rose-300">خطا در پردازش یا تولید محتوا</h3>
            <p className="text-sm mt-1 leading-relaxed opacity-90">{prog?.error || `کد خطا: ${doc.errorCode}`}</p>
          </div>
        </div>
      )}

      {/* AI Pipeline Visual Stage Timeline */}
      <div className="bg-[var(--color-surface)] p-6 rounded-2xl border border-[var(--color-border)] shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--color-border)] pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[var(--color-surface-warm)] text-[var(--color-primary-default)] rounded-xl border border-[var(--color-border)]">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-[var(--color-text)]">خط لوله تولید هوش مصنوعی (AI Generation Pipeline)</h2>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">رهگیری لحظه‌ای و گام‌به‌گام مراحل تولید و اعتبارسنجی محتوا</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--color-text-muted)]">وضعیت خط لوله:</span>
            <AdminStatusBadge status={progressStatus} />
            {prog?.progress && typeof prog.progress.percentage === "number" && (
              <span className="text-xs font-semibold text-[var(--color-primary-default)] bg-[var(--color-surface-warm)] px-2.5 py-0.5 rounded-full border border-[var(--color-border)]" dir="ltr">
                {prog.progress.percentage}%
              </span>
            )}
          </div>
        </div>

        {/* 8-Stage Visual Stepper Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          {PIPELINE_STAGES.map((stage, idx) => {
            const state = getStageState(stage.id);
            const Icon = stage.icon;

            const isCurrent = state === "active";
            const isDone = state === "completed";
            const isErr = state === "failed";
            const isQ = state === "queued";

            let cardBg = "bg-[var(--color-surface-subtle)] border-[var(--color-border)] text-[var(--color-text-muted)]";
            let iconColor = "text-[var(--color-text-muted)] bg-[var(--color-surface)] border border-[var(--color-border)]";
            let badgeText = "در انتظار";
            let badgeColor = "text-[var(--color-text-muted)] bg-[var(--color-surface)] border-[var(--color-border)]";

            if (isDone) {
              cardBg = "bg-emerald-500/5 border-emerald-500/20 text-emerald-800 dark:text-emerald-300";
              iconColor = "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20";
              badgeText = "تکمیل شده";
              badgeColor = "text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border-emerald-500/20 font-semibold";
            } else if (isCurrent) {
              cardBg = "bg-[var(--color-surface)] border-[var(--color-primary-default)] text-[var(--color-text)] ring-2 ring-[var(--color-primary-default)]/20 shadow-sm";
              iconColor = "text-[var(--color-primary-default)] bg-[var(--color-surface-warm)] border border-[var(--color-primary-default)]/30";
              badgeText = "در حال انجام";
              badgeColor = "text-[var(--color-primary-default)] bg-[var(--color-surface-warm)] border-[var(--color-primary-default)]/30 font-semibold";
            } else if (isErr) {
              cardBg = "bg-rose-500/5 border-rose-500/30 text-rose-800 dark:text-rose-300";
              iconColor = "text-rose-600 dark:text-rose-400 bg-rose-500/10 border border-rose-500/20";
              badgeText = "متوقف با خطا";
              badgeColor = "text-rose-700 dark:text-rose-300 bg-rose-500/10 border-rose-500/20 font-semibold";
            } else if (isQ) {
              cardBg = "bg-amber-500/5 border-amber-500/30 text-amber-800 dark:text-amber-300";
              iconColor = "text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20";
              badgeText = "در صف";
              badgeColor = "text-amber-700 dark:text-amber-300 bg-amber-500/10 border-amber-500/20 font-semibold";
            }

            return (
              <div
                key={stage.id}
                className={`p-3.5 rounded-xl border transition-all duration-200 flex flex-col justify-between ${cardBg}`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-[11px] font-mono opacity-70">گام ۰{toPersianDigits(idx + 1)}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${badgeColor}`}>
                      {badgeText}
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5 mb-1.5">
                    <div className={`p-1.5 rounded-lg shrink-0 ${iconColor}`}>
                      {isCurrent ? (
                        <Loader2 className="w-4 h-4 animate-spin text-[var(--color-primary-default)]" />
                      ) : isDone ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      ) : isErr ? (
                        <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                      ) : isQ ? (
                        <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                      ) : (
                        <Icon className="w-4 h-4" />
                      )}
                    </div>
                    <span className="font-semibold text-sm truncate">{stage.label}</span>
                  </div>
                  <p className="text-[11px] opacity-80 line-clamp-2 leading-relaxed">
                    {stage.description}
                  </p>
                </div>

                {isCurrent && prog?.progress && (
                  <div className="mt-3 pt-2.5 border-t border-[var(--color-border)] space-y-1.5">
                    <div className="flex justify-between text-[11px] text-[var(--color-primary-default)] font-semibold">
                      <span>پیشرفت مرحله</span>
                      <span dir="ltr">
                        {prog.progress.current} / {prog.progress.total}
                      </span>
                    </div>
                    <div className="w-full bg-[var(--color-surface-subtle)] border border-[var(--color-border)] rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-[var(--color-primary-default)] h-1.5 rounded-full transition-all duration-300"
                        style={{ width: `${Math.max(5, prog.progress.percentage)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Detailed Generation Meta */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-[var(--color-border)] text-xs text-[var(--color-text)]">
          <div className="bg-[var(--color-surface-subtle)] p-3.5 rounded-xl border border-[var(--color-border)] space-y-1">
            <span className="text-[var(--color-text-muted)] flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-[var(--color-primary-default)]" /> مرحله فعلی
            </span>
            <span className="font-semibold text-xs sm:text-sm text-[var(--color-text)]">{prog?.stageLabel || (prog?.stage ? prog.stage : "تعریف‌نشده")}</span>
          </div>
          <div className="bg-[var(--color-surface-subtle)] p-3.5 rounded-xl border border-[var(--color-border)] space-y-1">
            <span className="text-[var(--color-text-muted)] flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[var(--color-primary-default)]" /> شمارنده واحدها
            </span>
            <span className="font-semibold text-xs sm:text-sm text-[var(--color-text)]" dir="ltr">
              {prog?.progress ? `${prog.progress.current} / ${prog.progress.total} (${prog.progress.percentage}%)` : "-"}
            </span>
          </div>
          <div className="bg-[var(--color-surface-subtle)] p-3.5 rounded-xl border border-[var(--color-border)] space-y-1">
            <span className="text-[var(--color-text-muted)] flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-500" /> شروع مرحله
            </span>
            <span className="font-semibold text-xs sm:text-sm text-[var(--color-text)]" dir="ltr">
              {prog?.stageStartedAt ? new Date(prog.stageStartedAt).toLocaleString("fa-IR") : "-"}
            </span>
          </div>
          <div className="bg-[var(--color-surface-subtle)] p-3.5 rounded-xl border border-[var(--color-border)] space-y-1">
            <span className="text-[var(--color-text-muted)] flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5 text-emerald-500" /> آخرین فعالیت
            </span>
            <span className="font-semibold text-xs sm:text-sm text-[var(--color-text)]" dir="ltr">
              {prog?.lastActivityAt ? new Date(prog.lastActivityAt).toLocaleString("fa-IR") : "-"}
            </span>
          </div>
        </div>
      </div>

      {/* Basic & Relationship Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-[var(--color-surface)] p-6 rounded-2xl border border-[var(--color-border)] shadow-sm space-y-4">
          <h2 className="text-base font-bold text-[var(--color-text)] border-b border-[var(--color-border)] pb-3">اطلاعات پایه</h2>
          <div className="space-y-3 text-xs sm:text-sm">
            <div className="flex justify-between items-center py-1">
              <span className="text-[var(--color-text-muted)] flex items-center gap-2"><FileText className="w-4 h-4"/> نام فایل</span>
              <span className="text-[var(--color-text)] font-semibold break-all" dir="ltr">{doc.originalName}</span>
            </div>
            <div className="flex justify-between items-center py-1">
              <span className="text-[var(--color-text-muted)] flex items-center gap-2"><HardDrive className="w-4 h-4"/> حجم</span>
              <span className="text-[var(--color-text)] font-mono" dir="ltr">{(doc.sizeBytes / 1024 / 1024).toFixed(2)} MB</span>
            </div>
            <div className="flex justify-between items-center py-1">
              <span className="text-[var(--color-text-muted)] flex items-center gap-2"><FileText className="w-4 h-4"/> نوع (MIME)</span>
              <span className="text-[var(--color-text)] font-mono text-xs" dir="ltr">{doc.mimeType}</span>
            </div>
            <div className="flex justify-between items-center py-1">
              <span className="text-[var(--color-text-muted)] flex items-center gap-2"><AlertTriangle className="w-4 h-4"/> وضعیت سند</span>
              <AdminStatusBadge status={doc.status} />
            </div>
          </div>
        </div>

        <div className="bg-[var(--color-surface)] p-6 rounded-2xl border border-[var(--color-border)] shadow-sm space-y-4">
          <h2 className="text-base font-bold text-[var(--color-text)] border-b border-[var(--color-border)] pb-3">روابط و مالکیت</h2>
          <div className="space-y-3 text-xs sm:text-sm">
            <div className="flex justify-between items-center py-1">
              <span className="text-[var(--color-text-muted)] flex items-center gap-2"><User className="w-4 h-4"/> کاربر ایجاد کننده</span>
              <span className="text-[var(--color-text)] font-mono text-xs" dir="ltr">{doc.ownerEmail || "-"}</span>
            </div>
            <div className="flex justify-between items-center py-1">
              <span className="text-[var(--color-text-muted)] flex items-center gap-2"><HardDrive className="w-4 h-4"/> دوره مرتبط</span>
              <span className="text-[var(--color-text)] font-medium">{doc.courseName || "-"}</span>
            </div>
            <div className="flex justify-between items-center py-1">
              <span className="text-[var(--color-text-muted)] flex items-center gap-2"><Calendar className="w-4 h-4"/> تاریخ آپلود</span>
              <span className="text-[var(--color-text)] text-xs" dir="ltr">{new Date(doc.createdAt).toLocaleString("fa-IR")}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

