import { useState, useRef } from "react";
import {
  X,
  UploadCloud,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  BookOpen,
  FolderOpen,
} from "lucide-react";
import { getFileIcon, formatBytes } from "./FileTable.js";
import type { CourseResource, ContentModuleResource } from "@avana/contracts";

export interface FileUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadFile: (
    file: File,
    courseId?: string,
    onProgress?: (percent: number) => void,
  ) => Promise<{ success: boolean; error?: string }>;
  onUploadFinished?: () => void;
  courses: CourseResource[];
  loadModulesForCourse?: (courseId: string) => Promise<ContentModuleResource[]>;
}

type QueuedFile = {
  id: string;
  file: File;
  status: "pending" | "uploading" | "success" | "error";
  progress: number;
  errorMessage?: string;
};

export function FileUploadModal({
  isOpen,
  onClose,
  onUploadFile,
  onUploadFinished,
  courses,
  loadModulesForCourse,
}: FileUploadModalProps) {
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const [selectedModuleId, setSelectedModuleId] = useState<string>("");
  const [modules, setModules] = useState<ContentModuleResource[]>([]);
  const [loadingModules, setLoadingModules] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleCourseChange = async (courseId: string) => {
    setSelectedCourseId(courseId);
    setSelectedModuleId("");
    setModules([]);
    if (courseId && loadModulesForCourse) {
      setLoadingModules(true);
      try {
        const mods = await loadModulesForCourse(courseId);
        setModules(mods);
      } catch {
        setModules([]);
      } finally {
        setLoadingModules(false);
      }
    }
  };

  const handleFilesAdded = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const newItems: QueuedFile[] = Array.from(files).map((file) => ({
      id: crypto.randomUUID(),
      file,
      status: "pending",
      progress: 0,
    }));
    setQueue((prev) => [...prev, ...newItems]);
  };

  const handleRemoveFromQueue = (id: string) => {
    setQueue((prev) => prev.filter((item) => item.id !== id));
  };

  const handleStartUpload = async () => {
    if (queue.length === 0 || isUploading) return;
    setIsUploading(true);

    let allDone = true;
    for (const item of queue) {
      if (item.status === "success") continue;

      setQueue((prev) =>
        prev.map((q) =>
          q.id === item.id ? { ...q, status: "uploading", progress: 30 } : q,
        ),
      );

      try {
        const result = await onUploadFile(
          item.file,
          selectedCourseId || undefined,
          (percent) => {
            setQueue((prev) =>
              prev.map((q) =>
                q.id === item.id ? { ...q, progress: percent } : q,
              ),
            );
          },
        );

        if (result.success) {
          setQueue((prev) =>
            prev.map((q) =>
              q.id === item.id
                ? { ...q, status: "success", progress: 100 }
                : q,
            ),
          );
        } else {
          allDone = false;
          setQueue((prev) =>
            prev.map((q) =>
              q.id === item.id
                ? {
                    ...q,
                    status: "error",
                    errorMessage: result.error || "خطا در آپلود",
                  }
                : q,
            ),
          );
        }
      } catch (err) {
        allDone = false;
        setQueue((prev) =>
          prev.map((q) =>
            q.id === item.id
              ? {
                  ...q,
                  status: "error",
                  errorMessage:
                    err instanceof Error ? err.message : "خطا در آپلود",
                }
              : q,
          ),
        );
      }
    }

    setIsUploading(false);
    if (allDone) {
      onUploadFinished?.();
    }
  };

  const pendingCount = queue.filter((q) => q.status !== "success").length;
  const hasSuccess = queue.some((q) => q.status === "success");

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 transition-opacity"
        onClick={() => !isUploading && onClose()}
      />

      {/* Modal Container */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
        dir="rtl"
      >
        <div className="bg-[#0f172a] border border-white/15 rounded-3xl max-w-xl w-full p-6 shadow-2xl space-y-6 text-slate-200 font-sans">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-teal-500/10 text-teal-400 border border-teal-500/20">
                <UploadCloud className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-white">
                  آپلود فایل‌ها و منابع آموزشی
                </h2>
                <p className="text-xs text-slate-400">
                  فرمت‌های PDF, DOCX, PPTX, TXT تا سقف ۵۰ مگابایت
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={isUploading}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Hierarchical Tagging: Course & Module Selector */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-2xl bg-white/5 border border-white/5 text-xs">
            {/* Course Selector */}
            <div className="space-y-1.5">
              <label className="text-slate-400 flex items-center gap-1.5 font-medium">
                <BookOpen className="w-3.5 h-3.5 text-teal-400" />
                <span>انتخاب دوره (اختیاری)</span>
              </label>
              <select
                value={selectedCourseId}
                onChange={(e) => void handleCourseChange(e.target.value)}
                disabled={isUploading}
                className="w-full bg-[#131d31] border border-white/10 rounded-xl px-3 py-2 text-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-teal-500"
              >
                <option value="">بدون اتصال به دوره (فایل آزاد)</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>

            {/* Module Selector */}
            <div className="space-y-1.5">
              <label className="text-slate-400 flex items-center gap-1.5 font-medium">
                <FolderOpen className="w-3.5 h-3.5 text-purple-400" />
                <span>سرفصل / ماژول</span>
              </label>
              <select
                value={selectedModuleId}
                onChange={(e) => setSelectedModuleId(e.target.value)}
                disabled={!selectedCourseId || isUploading || loadingModules}
                className="w-full bg-[#131d31] border border-white/10 rounded-xl px-3 py-2 text-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:opacity-50"
              >
                <option value="">
                  {loadingModules ? "در حال بارگذاری سرفصل‌ها..." : "انتخاب سرفصل (اختیاری)"}
                </option>
                {modules.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Drag & Drop Area */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragOver(false);
              handleFilesAdded(e.dataTransfer.files);
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-3xl p-8 text-center cursor-pointer transition-all ${
              isDragOver
                ? "border-teal-400 bg-teal-500/10 scale-[1.01]"
                : "border-white/15 hover:border-teal-500/40 bg-white/[0.02]"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.docx,.doc,.pptx,.ppt,.txt,.md,.json,.csv,image/*"
              onChange={(e) => handleFilesAdded(e.target.files)}
              className="hidden"
            />
            <UploadCloud className="w-10 h-10 text-teal-400 mx-auto mb-3 animate-bounce" />
            <h3 className="text-sm font-bold text-white">
              فایل‌ها را به این قسمت بکشید یا برای انتخاب کلیک کنید
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              امکان انتخاب همزمان چند فایل وجود دارد
            </p>
          </div>

          {/* Queued Files List */}
          {queue.length > 0 && (
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                <span>فایل‌های انتخاب‌شده ({queue.length.toLocaleString("fa-IR")})</span>
                {!isUploading && (
                  <button
                    type="button"
                    onClick={() => setQueue([])}
                    className="text-rose-400 hover:underline"
                  >
                    حذف همه
                  </button>
                )}
              </div>

              {queue.map((item) => (
                <div
                  key={item.id}
                  className="p-3 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 rounded-xl bg-white/5 border border-white/10 shrink-0">
                      {getFileIcon(item.file.type, item.file.name)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-white truncate max-w-xs">
                        {item.file.name}
                      </p>
                      <p className="text-[10px] text-slate-400 font-mono" dir="ltr">
                        {formatBytes(item.file.size)}
                      </p>
                    </div>
                  </div>

                  {/* Status Indicator */}
                  <div className="flex items-center gap-2 shrink-0">
                    {item.status === "uploading" && (
                      <div className="flex items-center gap-1.5 text-teal-400 font-semibold">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>در حال آپلود...</span>
                      </div>
                    )}
                    {item.status === "success" && (
                      <div className="flex items-center gap-1 text-emerald-400 font-semibold">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>آماده</span>
                      </div>
                    )}
                    {item.status === "error" && (
                      <div className="flex items-center gap-1 text-rose-400 font-semibold">
                        <AlertTriangle className="w-4 h-4" />
                        <span title={item.errorMessage}>خطا</span>
                      </div>
                    )}
                    {item.status === "pending" && !isUploading && (
                      <button
                        type="button"
                        onClick={() => handleRemoveFromQueue(item.id)}
                        className="p-1 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-white/10 transition-colors"
                        title="حذف از لیست"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Modal Footer */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              disabled={isUploading}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:bg-white/10 transition-colors disabled:opacity-50"
            >
              {hasSuccess ? "پایان و بستن" : "انصراف"}
            </button>

            {pendingCount > 0 && (
              <button
                type="button"
                onClick={handleStartUpload}
                disabled={isUploading}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold transition-colors shadow-lg shadow-teal-900/40 disabled:opacity-50"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>در حال آپلود و استخراج...</span>
                  </>
                ) : (
                  <>
                    <UploadCloud className="w-4 h-4" />
                    <span>شروع آپلود ({pendingCount.toLocaleString("fa-IR")} فایل)</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
