import { useState } from "react";
import {
  X,
  Download,
  RefreshCw,
  Edit2,
  Trash2,
  Copy,
  Check,
  BookOpen,
  Sparkles,
  ExternalLink,
  ShieldCheck,
  FolderOpen,
} from "lucide-react";
import type { DocumentDetailResource } from "@avana/contracts";
import { toPersianDigits } from "@avana/domain";
import { Tabs } from "@avana/ui";
import {
  getFileIcon,
  formatBytes,
  formatDatePersian,
  getStatusBadge,
} from "./FileTable.js";

export interface FileDetailsDrawerProps {
  document: DocumentDetailResource | null;
  isOpen: boolean;
  onClose: () => void;
  onPreview: (doc: DocumentDetailResource) => void;
  onDownload: (doc: DocumentDetailResource) => void;
  onRename: (doc: DocumentDetailResource) => void;
  onAttachCourse: (doc: DocumentDetailResource) => void;
  onReprocess: (doc: DocumentDetailResource) => void;
  onDelete: (doc: DocumentDetailResource) => void;
  getDownloadUrl: (docId: string, inline?: boolean) => string;
  isReprocessing?: boolean;
}

type DrawerTab = "general" | "educational" | "preview";

export function FileDetailsDrawer({
  document,
  isOpen,
  onClose,
  onDownload,
  onRename,
  onAttachCourse,
  onReprocess,
  onDelete,
  getDownloadUrl,
  isReprocessing,
}: FileDetailsDrawerProps) {
  const [activeTab, setActiveTab] = useState<DrawerTab>("general");
  const [copiedField, setCopiedField] = useState<string | null>(null);

  if (!isOpen || !document) return null;

  const handleCopy = (text: string, fieldName: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const previewUrl = getDownloadUrl(document.id, true);

  const isPdf =
    document.mime_type.toLowerCase().includes("pdf") ||
    document.original_name.toLowerCase().endsWith(".pdf");
  const isImage = document.mime_type.toLowerCase().startsWith("image/");

  // AI Pipeline Stage Detection
  const pipelineStages = [
    {
      id: "uploaded",
      title: "آپلود اولیه",
      desc: "فایل با موفقیت بارگذاری و هش امنیتی ثبت شد",
      isComplete: true,
    },
    {
      id: "extracted",
      title: "استخراج متن و ساختار",
      desc:
        document.page_count !== null && document.page_count !== undefined
          ? `${toPersianDigits(document.page_count)} صفحه استخراج شد`
          : "استخراج متن از اسناد",
      isComplete:
        document.status === "extracted" ||
        document.status === "ready" ||
        (document.usage?.chunks_count ?? 0) > 0,
      isCurrent: document.status === "extracting",
    },
    {
      id: "chunked",
      title: "قطعه‌بندی معنایی (Chunking)",
      desc:
        (document.usage?.chunks_count ?? 0) > 0
          ? `${document.usage?.chunks_count} بخش معنایی ساخته شد`
          : "تولید چانک‌ها برای استناد هوش مصنوعی",
      isComplete: (document.usage?.chunks_count ?? 0) > 0,
      isCurrent: document.status === "chunking",
    },
    {
      id: "ready",
      title: "آماده‌سازی برای مدل AI",
      desc: "آماده برای پرسش و پاسخ و ساخت محتوای هوشمند",
      isComplete:
        document.status === "extracted" || document.status === "ready",
      isCurrent:
        document.status === "pending_generation" ||
        document.status === "generating",
    },
    {
      id: "materialized",
      title: "استفاده در آموزش",
      desc:
        (document.usage?.lessons_count ?? 0) > 0 ||
        (document.usage?.flashcards_count ?? 0) > 0 ||
        (document.usage?.quizzes_count ?? 0) > 0
          ? "متصل به دروس، فلش‌کارت‌ها یا آزمون‌ها"
          : "هنوز محتوای آموزشی از این فایل تولید نشده است",
      isComplete:
        (document.usage?.lessons_count ?? 0) > 0 ||
        (document.usage?.flashcards_count ?? 0) > 0 ||
        (document.usage?.quizzes_count ?? 0) > 0,
    },
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 transition-opacity"
        onClick={onClose}
      />

      {/* Slide-over Drawer Panel */}
      <div
        className="fixed inset-y-0 right-0 max-w-2xl w-full bg-[var(--color-surface)] border-l border-[var(--color-border)] shadow-2xl z-50 flex flex-col font-sans text-[var(--color-text)] overflow-hidden"
        dir="rtl"
      >
        {/* Drawer Header */}
        <div className="p-6 border-b border-[var(--color-border)] flex items-start justify-between gap-4 bg-[var(--color-surface)]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-3 rounded-2xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] shrink-0">
              {getFileIcon(document.mime_type, document.original_name)}
            </div>
            <div className="min-w-0">
              <h2
                className="text-base sm:text-lg font-bold text-[var(--color-text)] truncate"
                title={document.original_name}
              >
                {document.original_name}
              </h2>
              <div className="flex items-center gap-2 mt-1">
                {getStatusBadge(document.status)}
                <span className="text-xs text-[var(--color-text-muted)] font-mono" dir="ltr">
                  {formatBytes(document.size_bytes)}
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-slate-100 transition-colors"
            aria-label="بستن پنجره"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Toolbar */}
        <div className="px-6 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface-warm)] flex items-center justify-between gap-2 overflow-x-auto text-xs">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onDownload(document)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-50 hover:bg-teal-100 text-[#008080] border border-teal-200 transition-colors font-semibold"
            >
              <Download className="w-3.5 h-3.5" />
              <span>دانلود</span>
            </button>

            <button
              type="button"
              onClick={() => onRename(document)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-[var(--color-text)] border border-[var(--color-border)] transition-colors"
            >
              <Edit2 className="w-3.5 h-3.5" />
              <span>تغییر نام</span>
            </button>

            <button
              type="button"
              onClick={() => onAttachCourse(document)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 transition-colors"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>اتصال به دوره</span>
            </button>

            <button
              type="button"
              onClick={() => onReprocess(document)}
              disabled={isReprocessing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 transition-colors disabled:opacity-50"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isReprocessing ? "animate-spin" : ""}`}
              />
              <span>پردازش مجدد</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => onDelete(document)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition-colors font-semibold"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>حذف</span>
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 bg-[var(--color-surface-warm)]">
          <Tabs
            items={[
              { id: "general", label: "اطلاعات عمومی و فنی" },
              { id: "educational", label: "جریان آموزشی و AI" },
              { id: "preview", label: "پیش‌نمایش فایل" },
            ]}
            activeTabId={activeTab}
            onChange={(id) => setActiveTab(id as DrawerTab)}
            variant="underline"
            className="gap-0"
          />
        </div>

        {/* Tab Content Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: General & Technical */}
          {activeTab === "general" && (
            <div className="space-y-6">
              {/* General Metadata Section */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-[#008080] uppercase tracking-wider">
                  مشخصات عمومی
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] space-y-1">
                    <span className="text-[var(--color-text-muted)]">نام کامل فایل</span>
                    <p className="font-semibold text-[var(--color-text)] break-all">
                      {document.original_name}
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] space-y-1">
                    <span className="text-[var(--color-text-muted)]">نوع MIME</span>
                    <p className="font-mono text-[var(--color-text)]" dir="ltr">
                      {document.mime_type}
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] space-y-1">
                    <span className="text-[var(--color-text-muted)]">حجم فایل</span>
                    <p className="font-mono text-[var(--color-text)]" dir="ltr">
                      {formatBytes(document.size_bytes)} ({document.size_bytes.toLocaleString()} bytes)
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] space-y-1">
                    <span className="text-[var(--color-text-muted)]">تاریخ آپلود</span>
                    <p className="text-[var(--color-text)]">
                      {formatDatePersian(document.created_at)}
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] space-y-1">
                    <span className="text-[var(--color-text-muted)]">آخرین تغییر</span>
                    <p className="text-[var(--color-text)]">
                      {formatDatePersian(document.updated_at)}
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] space-y-1">
                    <span className="text-[var(--color-text-muted)]">تعداد صفحات (Page Count)</span>
                    <p className="text-[var(--color-text)]">
                      {document.page_count
                        ? `${document.page_count.toLocaleString("fa-IR")} صفحه`
                        : "نامشخص"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Technical / Security Section */}
              <div className="space-y-3 pt-4 border-t border-[var(--color-border)]">
                <h3 className="text-xs font-bold text-[#008080] uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-[#008080]" />
                  <span>اطلاعات فنی و امنیتی</span>
                </h3>

                <div className="space-y-2 text-xs">
                  {/* Document ID */}
                  <div className="p-3 rounded-xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-[var(--color-text-muted)] block text-[11px]">شناسه سند (Document ID)</span>
                      <p className="font-mono text-[var(--color-text)] truncate text-[11px]" dir="ltr">
                        {document.id}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy(document.id, "id")}
                      className="p-1.5 rounded-lg hover:bg-slate-200 text-[var(--color-text-muted)] hover:text-[var(--color-text)] shrink-0"
                      title="کپی شناسه"
                    >
                      {copiedField === "id" ? (
                        <Check className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>

                  {/* SHA-256 Checksum */}
                  <div className="p-3 rounded-xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-[var(--color-text-muted)] block text-[11px]">هش رمزنگاری SHA-256</span>
                      <p className="font-mono text-[var(--color-text)] truncate text-[11px]" dir="ltr">
                        {document.sha256}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy(document.sha256, "sha256")}
                      className="p-1.5 rounded-lg hover:bg-slate-200 text-[var(--color-text-muted)] hover:text-[var(--color-text)] shrink-0"
                      title="کپی هش"
                    >
                      {copiedField === "sha256" ? (
                        <Check className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>

                  {/* Storage Key (Ref) */}
                  {document.storage_key && (
                    <div className="p-3 rounded-xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-[var(--color-text-muted)] block text-[11px]">کلید ذخیره‌سازی (Storage Key)</span>
                        <p className="font-mono text-[var(--color-text-muted)] truncate text-[11px]" dir="ltr">
                          {document.storage_key}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Error code if failed */}
                  {document.error_code && (
                    <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                      <span className="font-bold block">خطای پردازش:</span>
                      <p className="font-mono mt-1">{document.error_code}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Educational & AI Pipeline */}
          {activeTab === "educational" && (
            <div className="space-y-6">
              {/* Linked Educational Entities */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-[#008080] uppercase tracking-wider">
                  محل و وابستگی‌های آموزشی
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  {/* Linked Course */}
                  <div className="p-4 rounded-xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] space-y-1">
                    <span className="text-[var(--color-text-muted)] flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5 text-[#008080]" />
                      دوره متصل
                    </span>
                    <p className="font-semibold text-[var(--color-text)] text-sm">
                      {document.usage?.course?.name ?? "بدون اتصال به دوره"}
                    </p>
                  </div>

                  {/* Linked Modules */}
                  <div className="p-4 rounded-xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] space-y-1">
                    <span className="text-[var(--color-text-muted)] flex items-center gap-1.5">
                      <FolderOpen className="w-3.5 h-3.5 text-purple-600" />
                      ماژول / سرفصل منبع
                    </span>
                    <p className="font-semibold text-[var(--color-text)] text-sm">
                      {document.usage?.modules && document.usage.modules.length > 0
                        ? document.usage.modules.map((m: { id: string; title: string }) => m.title).join("، ")
                        : "به عنوان سرفصل ثبت نشده است"}
                    </p>
                  </div>
                </div>

                {/* Generated Items Breakdown Cards */}
                <div className="grid grid-cols-3 gap-3 pt-2">
                  <div className="p-3 rounded-xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-center">
                    <span className="text-[11px] text-[var(--color-text-muted)]">دروس تولیدشده</span>
                    <p className="text-lg font-bold text-[#008080] mt-1">
                      {(document.usage?.lessons_count ?? 0).toLocaleString("fa-IR")}
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-center">
                    <span className="text-[11px] text-[var(--color-text-muted)]">فلش‌کارت‌ها</span>
                    <p className="text-lg font-bold text-purple-600 mt-1">
                      {(document.usage?.flashcards_count ?? 0).toLocaleString("fa-IR")}
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-center">
                    <span className="text-[11px] text-[var(--color-text-muted)]">آزمون‌ها</span>
                    <p className="text-lg font-bold text-amber-600 mt-1">
                      {(document.usage?.quizzes_count ?? 0).toLocaleString("fa-IR")}
                    </p>
                  </div>
                </div>
              </div>

              {/* 5-Step AI Pipeline Timeline */}
              <div className="space-y-4 pt-4 border-t border-[var(--color-border)]">
                <h3 className="text-xs font-bold text-[#008080] uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-[#008080]" />
                  <span>جریان پردازش و هوش مصنوعی</span>
                </h3>

                <div className="space-y-3 relative pr-2">
                  {pipelineStages.map((stage, idx) => (
                    <div key={stage.id} className="flex items-start gap-3 relative">
                      {/* Status Icon */}
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${
                          stage.isComplete
                            ? "bg-emerald-50 text-emerald-600 border border-emerald-300"
                            : stage.isCurrent
                            ? "bg-amber-50 text-amber-600 border border-amber-300 animate-pulse"
                            : "bg-slate-100 text-slate-400 border border-[var(--color-border)]"
                        }`}
                      >
                        {stage.isComplete ? (
                          <Check className="w-3.5 h-3.5" />
                        ) : (
                          <span>{(idx + 1).toLocaleString("fa-IR")}</span>
                        )}
                      </div>

                      <div className="min-w-0 pb-3">
                        <p
                          className={`text-xs font-bold ${
                            stage.isComplete
                              ? "text-[var(--color-text)]"
                              : stage.isCurrent
                              ? "text-amber-700 font-bold"
                              : "text-slate-400"
                          }`}
                        >
                          {stage.title}
                        </p>
                        <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                          {stage.desc}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Live Preview */}
          {activeTab === "preview" && (
            <div className="space-y-4">
              {isPdf ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)]">
                    <span>پیش‌نمایش سند PDF</span>
                    <a
                      href={previewUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-[#008080] hover:underline font-medium"
                    >
                      <span>باز کردن در پنجره جدید</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <iframe
                    src={previewUrl}
                    title={document.original_name}
                    className="w-full h-[550px] rounded-2xl border border-[var(--color-border)] bg-slate-50"
                  />
                </div>
              ) : isImage ? (
                <div className="space-y-3 text-center">
                  <span className="text-xs text-[var(--color-text-muted)] block text-right">
                    پیش‌نمایش تصویر
                  </span>
                  <div className="p-4 rounded-2xl border border-[var(--color-border)] bg-slate-50 flex items-center justify-center min-h-[300px]">
                    <img
                      src={previewUrl}
                      alt={document.original_name}
                      className="max-h-[500px] object-contain rounded-xl"
                    />
                  </div>
                </div>
              ) : (
                <div className="p-12 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-warm)] text-center space-y-4">
                  <div className="p-4 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] inline-block text-[var(--color-text-muted)]">
                    {getFileIcon(document.mime_type, document.original_name)}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-[var(--color-text)]">
                      پیش‌نمایش مستقیم این نوع فایل در دسترس نیست
                    </h4>
                    <p className="text-xs text-[var(--color-text-muted)] mt-1 max-w-sm mx-auto">
                      می‌توانید برای مشاهده یا استفاده، فایل را مستقیماً روی دستگاه خود دریافت کنید.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onDownload(document)}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#008080] hover:bg-[#006666] text-white text-xs font-bold transition-colors shadow-sm"
                  >
                    <Download className="w-4 h-4" />
                    <span>دانلود فایل ({formatBytes(document.size_bytes)})</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
