import { useState } from "react";
import {
  FileText,
  FileCode,
  FileSpreadsheet,
  FileImage,
  FileVideo,
  FileAudio,
  FileQuestion,
  MoreVertical,
  Eye,
  Download,
  Edit2,
  Link as LinkIcon,
  RefreshCw,
  Copy,
  Trash2,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ChevronRight,
  ChevronLeft,
  BookOpen,
} from "lucide-react";
import type { DocumentResource, DocumentStatus } from "@avana/contracts";

export interface FileTableProps {
  documents: DocumentResource[];
  selectedIds: string[];
  onSelectAll: (checked: boolean) => void;
  onSelectOne: (id: string, checked: boolean) => void;
  onViewDetails: (doc: DocumentResource) => void;
  onPreview: (doc: DocumentResource) => void;
  onDownload: (doc: DocumentResource) => void;
  onRename: (doc: DocumentResource) => void;
  onAttachCourse: (doc: DocumentResource) => void;
  onReprocess: (doc: DocumentResource) => void;
  onDelete: (doc: DocumentResource) => void;
  onCopyLink: (doc: DocumentResource) => void;
  isLoading?: boolean;
  pagination?: {
    total: number;
    page: number;
    limit: number;
    totalPages?: number;
    total_pages?: number;
  };
  onPageChange?: (page: number) => void;
  coursesMap?: Record<string, string>; // course_id -> course_name
}

export function getFileIcon(mimeType: string, originalName: string) {
  const norm = mimeType.toLowerCase();
  const ext = originalName.split(".").pop()?.toLowerCase() ?? "";

  if (norm.includes("pdf") || ext === "pdf") {
    return <FileText className="w-5 h-5 text-rose-400" />;
  }
  if (
    norm.includes("presentation") ||
    norm.includes("powerpoint") ||
    ext === "pptx" ||
    ext === "ppt"
  ) {
    return <FileSpreadsheet className="w-5 h-5 text-amber-400" />;
  }
  if (
    norm.includes("word") ||
    norm.includes("document") ||
    ext === "docx" ||
    ext === "doc"
  ) {
    return <FileText className="w-5 h-5 text-blue-400" />;
  }
  if (
    norm.includes("text") ||
    norm.includes("markdown") ||
    ext === "txt" ||
    ext === "md"
  ) {
    return <FileCode className="w-5 h-5 text-teal-400" />;
  }
  if (norm.startsWith("image/") || ["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) {
    return <FileImage className="w-5 h-5 text-purple-400" />;
  }
  if (norm.startsWith("video/") || ["mp4", "mkv", "avi"].includes(ext)) {
    return <FileVideo className="w-5 h-5 text-indigo-400" />;
  }
  if (norm.startsWith("audio/") || ["mp3", "wav", "m4a"].includes(ext)) {
    return <FileAudio className="w-5 h-5 text-pink-400" />;
  }
  return <FileQuestion className="w-5 h-5 text-slate-400" />;
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "۰ B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const val = (bytes / Math.pow(k, i)).toFixed(1);
  return `${val} ${sizes[i]}`;
}

export function formatDatePersian(isoString: string): string {
  try {
    const d = new Date(isoString);
    return new Intl.DateTimeFormat("fa-IR", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(d);
  } catch {
    return isoString;
  }
}

export function getStatusBadge(status: DocumentStatus) {
  switch (status) {
    case "extracted":
    case "ready":
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          <CheckCircle2 className="w-3 h-3" />
          آماده استفاده
        </span>
      );
    case "extracting":
    case "chunking":
    case "generating":
    case "pending_generation":
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse">
          <Clock className="w-3 h-3 animate-spin" />
          در حال پردازش
        </span>
      );
    case "uploaded":
    case "pending_extraction":
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
          <Clock className="w-3 h-3" />
          در صف
        </span>
      );
    case "failed":
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
          <AlertTriangle className="w-3 h-3" />
          خطا
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-500/10 text-slate-400 border border-slate-500/20">
          {status}
        </span>
      );
  }
}

export function FileTable({
  documents,
  selectedIds,
  onSelectAll,
  onSelectOne,
  onViewDetails,
  onPreview,
  onDownload,
  onRename,
  onAttachCourse,
  onReprocess,
  onDelete,
  onCopyLink,
  isLoading,
  pagination,
  onPageChange,
  coursesMap = {},
}: FileTableProps) {
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  const isAllSelected =
    documents.length > 0 && selectedIds.length === documents.length;
  const isPartiallySelected =
    selectedIds.length > 0 && selectedIds.length < documents.length;

  if (isLoading && documents.length === 0) {
    return (
      <div className="glass-panel border border-white/10 rounded-2xl overflow-hidden shadow-ambient">
        <div className="p-8 space-y-4">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="h-14 rounded-xl bg-white/5 animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="glass-panel border border-white/10 rounded-2xl overflow-hidden shadow-ambient">
      {/* Desktop Table View */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-right border-collapse text-xs xl:text-sm">
          <thead>
            <tr className="border-b border-white/10 bg-white/5 text-slate-400 font-medium">
              <th className="py-3.5 px-4 w-12 text-center">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = isPartiallySelected;
                  }}
                  onChange={(e) => onSelectAll(e.target.checked)}
                  className="rounded border-white/20 bg-white/10 text-teal-500 focus:ring-teal-500 cursor-pointer"
                  aria-label="انتخاب همه فایل‌ها"
                />
              </th>
              <th className="py-3.5 px-4">فایل</th>
              <th className="py-3.5 px-4">محل استفاده</th>
              <th className="py-3.5 px-4">حجم</th>
              <th className="py-3.5 px-4">وضعیت</th>
              <th className="py-3.5 px-4">تاریخ آپلود</th>
              <th className="py-3.5 px-4 text-center w-16">عملیات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 text-slate-200">
            {documents.map((doc) => {
              const isSelected = selectedIds.includes(doc.id);
              const courseTitle = doc.course_id
                ? coursesMap[doc.course_id] ?? "دوره متصل"
                : null;

              return (
                <tr
                  key={doc.id}
                  className={`hover:bg-white/5 transition-colors cursor-pointer group ${
                    isSelected ? "bg-teal-950/20" : ""
                  }`}
                  onClick={(e) => {
                    // Avoid opening drawer when clicking checkbox or action button
                    const target = e.target as HTMLElement;
                    if (
                      target.closest("input") ||
                      target.closest("button") ||
                      target.closest("a")
                    ) {
                      return;
                    }
                    onViewDetails(doc);
                  }}
                >
                  {/* Checkbox */}
                  <td className="py-3.5 px-4 text-center">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => onSelectOne(doc.id, e.target.checked)}
                      onClick={(e) => e.stopPropagation()}
                      className="rounded border-white/20 bg-white/10 text-teal-500 focus:ring-teal-500 cursor-pointer"
                      aria-label={`انتخاب ${doc.original_name}`}
                    />
                  </td>

                  {/* File Name & Icon */}
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-xl bg-white/5 border border-white/10 group-hover:border-teal-500/30 transition-colors shrink-0">
                        {getFileIcon(doc.mime_type, doc.original_name)}
                      </div>
                      <div className="min-w-0 max-w-xs xl:max-w-md">
                        <p
                          className="font-semibold text-slate-100 truncate hover:text-teal-300 transition-colors"
                          title={doc.original_name}
                        >
                          {doc.original_name}
                        </p>
                        <p className="text-[11px] text-slate-400 font-mono" dir="ltr">
                          {doc.mime_type.split("/")[1] || "file"} · {formatBytes(doc.size_bytes)}
                        </p>
                      </div>
                    </div>
                  </td>

                  {/* Usage / Course */}
                  <td className="py-3.5 px-4">
                    {courseTitle ? (
                      <div className="flex items-center gap-1.5 text-teal-300 font-medium">
                        <BookOpen className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                        <span className="truncate max-w-[180px]">{courseTitle}</span>
                      </div>
                    ) : (
                      <span className="text-slate-500 text-xs font-normal">بدون اتصال</span>
                    )}
                  </td>

                  {/* Size */}
                  <td className="py-3.5 px-4 font-mono text-slate-300 text-xs" dir="ltr">
                    {formatBytes(doc.size_bytes)}
                  </td>

                  {/* Status Badge */}
                  <td className="py-3.5 px-4">
                    {getStatusBadge(doc.status)}
                  </td>

                  {/* Upload Date */}
                  <td className="py-3.5 px-4 text-slate-400 text-xs">
                    {formatDatePersian(doc.created_at)}
                  </td>

                  {/* Actions Dropdown */}
                  <td className="py-3.5 px-4 text-center relative">
                    <div className="relative inline-block text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMenuId(activeMenuId === doc.id ? null : doc.id);
                        }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                        aria-label="منوی عملیات"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>

                      {activeMenuId === doc.id && (
                        <>
                          <div
                            className="fixed inset-0 z-20"
                            onClick={() => setActiveMenuId(null)}
                          />
                          <div className="absolute left-0 mt-1 w-48 rounded-xl bg-slate-900/95 border border-white/15 p-1.5 shadow-2xl backdrop-blur-xl z-30 flex flex-col gap-0.5 text-xs text-slate-200">
                            <button
                              type="button"
                              onClick={() => {
                                setActiveMenuId(null);
                                onViewDetails(doc);
                              }}
                              className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/10 text-right w-full transition-colors"
                            >
                              <Eye className="w-3.5 h-3.5 text-teal-400" />
                              <span>مشاهده جزئیات</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setActiveMenuId(null);
                                onPreview(doc);
                              }}
                              className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/10 text-right w-full transition-colors"
                            >
                              <Eye className="w-3.5 h-3.5 text-blue-400" />
                              <span>پیش‌نمایش</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setActiveMenuId(null);
                                onDownload(doc);
                              }}
                              className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/10 text-right w-full transition-colors"
                            >
                              <Download className="w-3.5 h-3.5 text-emerald-400" />
                              <span>دانلود فایل</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setActiveMenuId(null);
                                onRename(doc);
                              }}
                              className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/10 text-right w-full transition-colors"
                            >
                              <Edit2 className="w-3.5 h-3.5 text-slate-300" />
                              <span>تغییر نام</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setActiveMenuId(null);
                                onAttachCourse(doc);
                              }}
                              className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/10 text-right w-full transition-colors"
                            >
                              <LinkIcon className="w-3.5 h-3.5 text-purple-400" />
                              <span>اتصال / انتقال به دوره</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setActiveMenuId(null);
                                onReprocess(doc);
                              }}
                              className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/10 text-right w-full transition-colors"
                            >
                              <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
                              <span>پردازش مجدد</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setActiveMenuId(null);
                                onCopyLink(doc);
                              }}
                              className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/10 text-right w-full transition-colors"
                            >
                              <Copy className="w-3.5 h-3.5 text-slate-400" />
                              <span>کپی شناسه فایل</span>
                            </button>

                            <div className="my-1 border-t border-white/10" />

                            <button
                              type="button"
                              onClick={() => {
                                setActiveMenuId(null);
                                onDelete(doc);
                              }}
                              className="flex items-center gap-2 px-3 py-2 rounded-lg text-rose-400 hover:bg-rose-500/10 text-right w-full transition-colors font-medium"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>حذف فایل</span>
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Card List View */}
      <div className="md:hidden divide-y divide-white/5">
        {documents.map((doc) => {
          const isSelected = selectedIds.includes(doc.id);
          const courseTitle = doc.course_id
            ? coursesMap[doc.course_id] ?? "دوره متصل"
            : null;

          return (
            <div
              key={doc.id}
              className={`p-4 space-y-3 ${isSelected ? "bg-teal-950/20" : ""}`}
              onClick={() => onViewDetails(doc)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => onSelectOne(doc.id, e.target.checked)}
                    onClick={(e) => e.stopPropagation()}
                    className="rounded border-white/20 bg-white/10 text-teal-500 focus:ring-teal-500 cursor-pointer"
                  />
                  <div className="p-2 rounded-xl bg-white/5 border border-white/10 shrink-0">
                    {getFileIcon(doc.mime_type, doc.original_name)}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-100 truncate max-w-[200px]">
                      {doc.original_name}
                    </h4>
                    <p className="text-[10px] text-slate-400 font-mono" dir="ltr">
                      {formatBytes(doc.size_bytes)}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onViewDetails(doc);
                  }}
                  className="p-1 text-slate-400 hover:text-white"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              </div>

              <div className="flex items-center justify-between text-xs pt-1">
                <div>{getStatusBadge(doc.status)}</div>
                <div className="text-slate-400 text-[11px]">
                  {courseTitle ? (
                    <span className="text-teal-400 font-medium">{courseTitle}</span>
                  ) : (
                    "بدون اتصال"
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination Footer */}
      {(() => {
        if (!pagination) return null;
        const totalPages = pagination.totalPages ?? pagination.total_pages ?? 1;
        if (totalPages <= 1) return null;

        return (
          <div className="p-4 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
            <div>
              <span>نمایش </span>
              <span className="font-semibold text-slate-200">
                {(
                  (pagination.page - 1) * pagination.limit +
                  1
                ).toLocaleString("fa-IR")}
              </span>
              <span> تا </span>
              <span className="font-semibold text-slate-200">
                {Math.min(
                  pagination.page * pagination.limit,
                  pagination.total,
                ).toLocaleString("fa-IR")}
              </span>
              <span> از </span>
              <span className="font-semibold text-slate-200">
                {pagination.total.toLocaleString("fa-IR")}
              </span>
              <span> فایل</span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={pagination.page <= 1}
                onClick={() => onPageChange?.(pagination.page - 1)}
                className="p-1.5 rounded-lg border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                aria-label="صفحه قبلی"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              {[...Array(totalPages)].map((_, i) => {
                const p = i + 1;
                // Show only first, last, and around current page
                if (
                  p === 1 ||
                  p === totalPages ||
                  Math.abs(p - pagination.page) <= 1
                ) {
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => onPageChange?.(p)}
                      className={`w-8 h-8 rounded-lg text-xs font-semibold transition-colors ${
                        pagination.page === p
                          ? "bg-teal-600/30 text-teal-400 border border-teal-500/30"
                          : "bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10"
                      }`}
                    >
                      {p.toLocaleString("fa-IR")}
                    </button>
                  );
                }
                if (
                  (p === 2 && pagination.page > 3) ||
                  (p === totalPages - 1 &&
                    pagination.page < totalPages - 2)
                ) {
                  return (
                    <span key={p} className="px-1 text-slate-600">
                      ...
                    </span>
                  );
                }
                return null;
              })}

              <button
                type="button"
                disabled={pagination.page >= totalPages}
                onClick={() => onPageChange?.(pagination.page + 1)}
                className="p-1.5 rounded-lg border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                aria-label="صفحه بعدی"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
