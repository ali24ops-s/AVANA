import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api } from "../../lib/api/admin";
import { useAdmin } from "../../hooks/useAdmin.js";
import { useMutation } from "@tanstack/react-query";
import { AdminStatusBadge, AdminConfirmModal } from "../../components/admin/AdminUI";
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

  if (loading) return <div className="text-slate-400">در حال بارگذاری...</div>;
  if (error) return <div className="text-red-400">{error}</div>;
  if (!doc) return <div className="text-slate-400">فایل یافت نشد.</div>;

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
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/admin/documents" className="p-2 bg-slate-800 rounded-lg hover:bg-slate-700 text-slate-300 transition-colors">
          <ArrowRight className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
            <FileText className="w-6 h-6 text-teal-400" />
            جزئیات فایل و خط لوله هوش مصنوعی
          </h1>
          <p className="text-sm text-slate-400 mt-1" dir="ltr">{doc.id}</p>
        </div>
        
        {(doc.status === 'failed' || doc.status === 'error' || progressStatus === 'failed') && (
          <button 
            onClick={() => setIsRetryModalOpen(true)}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 px-4 py-2 rounded-lg text-sm transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            تلاش مجدد
          </button>
        )}
        <button 
          onClick={handleDownload}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm transition-colors"
        >
          <Download className="w-4 h-4" />
          دانلود فایل
        </button>
        <button 
          onClick={() => setIsDeleteModalOpen(true)}
          className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm transition-colors mr-auto"
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
        <div className="bg-amber-500/10 border border-amber-500/30 text-amber-300 p-4 rounded-xl flex items-start gap-3">
          <Clock className="w-5 h-5 mt-0.5 shrink-0 animate-pulse text-amber-400" />
          <div>
            <h3 className="font-semibold text-amber-200">عدم دریافت فعالیت در ۵ دقیقه اخیر</h3>
            <p className="text-sm mt-1 text-amber-300/90">
              خط لوله تولید در وضعیت فعال است اما بیش از ۵ دقیقه سیگنال فعالیتی ثبت نکرده است. این وضعیت معمولاً به دلیل صف درخواست مدل هوش مصنوعی یا پردازش فایل‌های سنگین رخ می‌دهد.
            </p>
          </div>
        </div>
      )}

      {/* Error Alert */}
      {(doc.errorCode || prog?.error) && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
          <div>
            <h3 className="font-medium text-red-300">خطا در پردازش یا تولید محتوا</h3>
            <p className="text-sm mt-1">{prog?.error || `کد خطا: ${doc.errorCode}`}</p>
          </div>
        </div>
      )}

      {/* AI Pipeline Visual Stage Timeline */}
      <div className="glass-panel p-6 rounded-2xl border border-white/5 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-teal-500/10 text-teal-400 rounded-xl border border-teal-500/20">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">خط لوله تولید هوش مصنوعی (AI Generation Pipeline)</h2>
              <p className="text-xs text-slate-400 mt-0.5">رهگیری لحظه‌ای و گام‌به‌گام مراحل تولید و اعتبارسنجی محتوا</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">وضعیت خط لوله:</span>
            <AdminStatusBadge status={progressStatus} />
            {prog?.progress && typeof prog.progress.percentage === "number" && (
              <span className="text-xs font-semibold text-teal-400 bg-teal-500/10 px-2.5 py-0.5 rounded-full border border-teal-500/20">
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

            let cardBg = "bg-slate-900/40 border-white/5 text-slate-400";
            let iconColor = "text-slate-500 bg-slate-800/80";
            let badgeText = "در انتظار";
            let badgeColor = "text-slate-500 bg-slate-800/50";

            if (isDone) {
              cardBg = "bg-emerald-950/20 border-emerald-500/30 text-emerald-300";
              iconColor = "text-emerald-400 bg-emerald-500/10";
              badgeText = "تکمیل شده";
              badgeColor = "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
            } else if (isCurrent) {
              cardBg = "bg-teal-950/40 border-teal-500/50 text-teal-200 ring-1 ring-teal-500/30";
              iconColor = "text-teal-300 bg-teal-500/20";
              badgeText = "در حال انجام";
              badgeColor = "text-teal-300 bg-teal-500/20 border-teal-500/30";
            } else if (isErr) {
              cardBg = "bg-red-950/20 border-red-500/30 text-red-300";
              iconColor = "text-red-400 bg-red-500/10";
              badgeText = "متوقف با خطا";
              badgeColor = "text-red-400 bg-red-500/10 border-red-500/20";
            } else if (isQ) {
              cardBg = "bg-amber-950/20 border-amber-500/30 text-amber-300";
              iconColor = "text-amber-400 bg-amber-500/10";
              badgeText = "در صف";
              badgeColor = "text-amber-400 bg-amber-500/10 border-amber-500/20";
            }

            return (
              <div
                key={stage.id}
                className={`p-3.5 rounded-xl border transition-all duration-200 flex flex-col justify-between ${cardBg}`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-[11px] font-mono opacity-60">گام ۰{idx + 1}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${badgeColor}`}>
                      {badgeText}
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5 mb-1.5">
                    <div className={`p-1.5 rounded-lg shrink-0 ${iconColor}`}>
                      {isCurrent ? (
                        <Loader2 className="w-4 h-4 animate-spin text-teal-300" />
                      ) : isDone ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ) : isErr ? (
                        <AlertCircle className="w-4 h-4 text-red-400" />
                      ) : isQ ? (
                        <Clock className="w-4 h-4 text-amber-400" />
                      ) : (
                        <Icon className="w-4 h-4" />
                      )}
                    </div>
                    <span className="font-semibold text-sm truncate">{stage.label}</span>
                  </div>
                  <p className="text-[11px] opacity-75 line-clamp-2 leading-relaxed">
                    {stage.description}
                  </p>
                </div>

                {isCurrent && prog?.progress && (
                  <div className="mt-3 pt-2.5 border-t border-teal-500/20 space-y-1.5">
                    <div className="flex justify-between text-[11px] text-teal-300 font-medium">
                      <span>پیشرفت مرحله</span>
                      <span dir="ltr">
                        {prog.progress.current} / {prog.progress.total}
                      </span>
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-teal-500 to-cyan-400 h-1.5 rounded-full transition-all duration-300"
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
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pt-2 border-t border-white/5 text-xs text-slate-300">
          <div className="bg-slate-900/30 p-3 rounded-xl border border-white/5 space-y-1">
            <span className="text-slate-400 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-teal-400" /> مرحله فعلی
            </span>
            <span className="font-medium text-slate-100">{prog?.stageLabel || (prog?.stage ? prog.stage : "تعریف‌نشده")}</span>
          </div>
          <div className="bg-slate-900/30 p-3 rounded-xl border border-white/5 space-y-1">
            <span className="text-slate-400 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" /> شمارنده واحدها
            </span>
            <span className="font-medium text-slate-100" dir="ltr">
              {prog?.progress ? `${prog.progress.current} / ${prog.progress.total} (${prog.progress.percentage}%)` : "-"}
            </span>
          </div>
          <div className="bg-slate-900/30 p-3 rounded-xl border border-white/5 space-y-1">
            <span className="text-slate-400 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-400" /> شروع مرحله
            </span>
            <span className="font-medium text-slate-100" dir="ltr">
              {prog?.stageStartedAt ? new Date(prog.stageStartedAt).toLocaleString("fa-IR") : "-"}
            </span>
          </div>
          <div className="bg-slate-900/30 p-3 rounded-xl border border-white/5 space-y-1">
            <span className="text-slate-400 flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5 text-emerald-400" /> آخرین فعالیت
            </span>
            <span className="font-medium text-slate-100" dir="ltr">
              {prog?.lastActivityAt ? new Date(prog.lastActivityAt).toLocaleString("fa-IR") : "-"}
            </span>
          </div>
        </div>
      </div>

      {/* Basic & Relationship Info */}
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
              <span className="text-slate-400 flex items-center gap-2"><AlertTriangle className="w-4 h-4"/> وضعیت سند</span>
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
