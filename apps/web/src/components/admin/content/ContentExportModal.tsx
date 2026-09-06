import { useState, useEffect } from "react";
import { X, Download, Loader2, CheckSquare, Square, Layers, BookOpen } from "lucide-react";
import { downloadContentExport, type AdminExportScope } from "../../../lib/api/admin";

interface CourseItem {
  id: string;
  name: string;
}

interface ContentExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  courses: CourseItem[];
}

export function ContentExportModal({ isOpen, onClose, courses }: ContentExportModalProps) {
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const [scope, setScope] = useState<Required<AdminExportScope>>({
    courses: true,
    modules: true,
    lessons: true,
    documents: true,
    generatedContent: true,
    flashcards: true,
    quizzes: true,
    questions: true,
    files: true,
  });
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const toggleScope = (key: keyof AdminExportScope) => {
    setScope((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const selectAllScope = (select: boolean) => {
    setScope({
      courses: select,
      modules: select,
      lessons: select,
      documents: select,
      generatedContent: select,
      flashcards: select,
      quizzes: select,
      questions: select,
      files: select,
    });
  };

  const handleExport = async () => {
    setExporting(true);
    setError(null);
    try {
      await downloadContentExport({
        courseId: selectedCourseId || undefined,
        scope,
      });
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "خطا در دانلود بسته خروجی");
    } finally {
      setExporting(false);
    }
  };

  const scopeLabels: Array<{ key: keyof AdminExportScope; label: string; desc: string }> = [
    { key: "courses", label: "دوره‌ها (Courses)", desc: "اطلاعات ساختاری و مشخصات دوره‌ها" },
    { key: "modules", label: "ماژول‌ها (Modules)", desc: "سرفصل‌ها و مباحث آموزشی" },
    { key: "lessons", label: "درس‌ها (Lessons)", desc: "متن و محتوای آموزشی درس‌ها" },
    { key: "documents", label: "اسناد (Documents)", desc: "متادیتا و قطعات منبع (Chunks)" },
    { key: "generatedContent", label: "محتوای هوش مصنوعی", desc: "پیش‌نویس‌ها و استنادات تولیدشده" },
    { key: "flashcards", label: "فلش‌کارت‌ها (Flashcards)", desc: "کارت‌های مرور فاصله‌دار (SRS)" },
    { key: "quizzes", label: "آزمون‌ها (Quizzes)", desc: "ساختار آزمون‌های ارزیابی" },
    { key: "questions", label: "سوالات و گزینه‌ها", desc: "سوالات، گزینه‌ها و پاسخ‌های صحیح" },
    { key: "files", label: "فایل‌های فیزیکی (Files)", desc: "فایل‌های PDF/اسناد الصاق‌شده در بسته" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700/60 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-800/40">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-teal-500/10 text-teal-400 rounded-xl">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100">خروجی محتوا (Export Package)</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                تولید بسته استاندارد و مستقل از ID جهت انتقال به محیط‌های دیگر
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {error && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Scope selection: Course */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-200">
              <BookOpen className="w-4 h-4 inline ml-2 text-teal-400" />
              محدوده دوره
            </label>
            <select
              value={selectedCourseId}
              onChange={(e) => setSelectedCourseId(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
            >
              <option value="">همه دوره‌ها (تمام محتوای آموزشی موجود)</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Entities Scope Checkboxes */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-slate-200">
                <Layers className="w-4 h-4 inline ml-2 text-teal-400" />
                موجودیت‌های شامل در بسته
              </label>
              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => selectAllScope(true)}
                  className="text-teal-400 hover:underline"
                >
                  انتخاب همه
                </button>
                <span className="text-slate-600">|</span>
                <button
                  type="button"
                  onClick={() => selectAllScope(false)}
                  className="text-slate-400 hover:underline"
                >
                  لغو همه
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {scopeLabels.map(({ key, label, desc }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleScope(key)}
                  className={`flex items-start gap-3 p-3 rounded-xl border text-right transition-colors ${
                    scope[key]
                      ? "bg-slate-800/80 border-teal-500/40 text-slate-200"
                      : "bg-slate-800/20 border-slate-800 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  <div className="mt-0.5 text-teal-400">
                    {scope[key] ? (
                      <CheckSquare className="w-4 h-4" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-600" />
                    )}
                  </div>
                  <div>
                    <div className="text-sm font-medium">{label}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-800 bg-slate-800/30">
          <button
            type="button"
            onClick={onClose}
            disabled={exporting}
            className="px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 rounded-xl transition-colors disabled:opacity-50"
          >
            انصراف
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-teal-600 hover:bg-teal-500 rounded-xl transition-colors shadow-lg shadow-teal-500/20 disabled:opacity-50"
          >
            {exporting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                در حال تولید بسته...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                دریافت خروجی (Export ZIP)
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
