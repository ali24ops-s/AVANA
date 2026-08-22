import { useState } from "react";
import { BookOpen, Loader2, X } from "lucide-react";
import type { CourseResource } from "@avana/contracts";

export interface FileAttachCourseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (courseId: string | null) => Promise<void>;
  courses: CourseResource[];
  currentCourseId?: string | null;
  count?: number;
  isSaving?: boolean;
}

export function FileAttachCourseModal({
  isOpen,
  onClose,
  onConfirm,
  courses,
  currentCourseId = null,
  count = 1,
  isSaving = false,
}: FileAttachCourseModalProps) {
  const [selectedCourseId, setSelectedCourseId] = useState<string>(
    currentCourseId ?? "",
  );

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onConfirm(selectedCourseId ? selectedCourseId : null);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 transition-opacity"
        onClick={() => !isSaving && onClose()}
      />

      {/* Modal Container */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
        dir="rtl"
      >
        <div className="bg-[#0f172a] border border-white/15 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5 text-slate-200 font-sans">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
                <BookOpen className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  {count > 1
                    ? `اتصال ${count.toLocaleString("fa-IR")} فایل به دوره`
                    : "اتصال / تغییر دوره فایل"}
                </h3>
                <p className="text-xs text-slate-400">
                  دوره مورد نظر را برای دسته‌بندی فایل انتخاب کنید
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5 text-xs">
              <label className="font-semibold text-slate-300">
                انتخاب دوره آموزشی:
              </label>
              <select
                value={selectedCourseId}
                onChange={(e) => setSelectedCourseId(e.target.value)}
                disabled={isSaving}
                className="w-full bg-[#131d31] border border-white/15 rounded-xl px-3.5 py-2.5 text-slate-100 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="">بدون اتصال به دوره (آزاد / Unassigned)</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:bg-white/10 transition-colors disabled:opacity-50"
              >
                انصراف
              </button>

              <button
                type="submit"
                disabled={isSaving}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-colors shadow-lg shadow-purple-900/40 disabled:opacity-50"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>در حال ذخیره...</span>
                  </>
                ) : (
                  <span>ثبت و اتصال</span>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
