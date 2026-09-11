import { useState, useEffect } from "react";
import { X, Download, Loader2, CheckSquare, Square, Layers, BookOpen } from "lucide-react";
import { downloadContentExport, type AdminExportScope } from "../../../lib/api/admin";
import { AvanaSelect } from "@avana/ui";

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" dir="rtl">
      <div className="relative w-full max-w-2xl bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[var(--color-border)] bg-[var(--color-surface-warm)]/60">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[var(--color-primary-default)]/10 text-[var(--color-primary-default)] rounded-xl">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[var(--color-text)]">خروجی محتوا (Export Package)</h2>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                تولید بسته استاندارد و مستقل از ID جهت انتقال به محیط‌های دیگر
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="بستن پنجره"
            className="p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {error && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Scope selection: Course */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-[var(--color-text)]">
              <BookOpen className="w-4 h-4 inline me-2 text-[var(--color-primary-default)]" />
              محدوده دوره
            </label>
            <AvanaSelect
              value={selectedCourseId}
              onChange={(val) => setSelectedCourseId(typeof val === "string" ? val : val[0] || "")}
              options={[
                { value: "", label: "همه دوره‌ها (تمام محتوای آموزشی موجود)" },
                ...courses.map((c) => ({ value: c.id, label: c.name })),
              ]}
            />
          </div>

          {/* Entities Scope Checkboxes */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-[var(--color-text)]">
                <Layers className="w-4 h-4 inline me-2 text-[var(--color-primary-default)]" />
                موجودیت‌های شامل در بسته
              </label>
              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => selectAllScope(true)}
                  className="text-[var(--color-primary-default)] hover:underline"
                >
                  انتخاب همه
                </button>
                <span className="text-[var(--color-border)]">|</span>
                <button
                  type="button"
                  onClick={() => selectAllScope(false)}
                  className="text-[var(--color-text-muted)] hover:underline"
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
                      ? "bg-[var(--color-primary-default)]/5 border-[var(--color-primary-default)]/40 text-[var(--color-text)]"
                      : "bg-[var(--color-surface-warm)]/40 border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-border)]"
                  }`}
                >
                  <div className="mt-0.5 text-[var(--color-primary-default)]">
                    {scope[key] ? (
                      <CheckSquare className="w-4 h-4" />
                    ) : (
                      <Square className="w-4 h-4 text-[var(--color-text-muted)]" />
                    )}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-[var(--color-text)]">{label}</div>
                    <div className="text-xs text-[var(--color-text-muted)] mt-0.5">{desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-5 border-t border-[var(--color-border)] bg-[var(--color-surface-warm)]/40">
          <button
            type="button"
            onClick={onClose}
            disabled={exporting}
            className="px-4 py-2 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] border border-[var(--color-border)] rounded-xl transition-colors disabled:opacity-50"
          >
            انصراف
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-[var(--color-primary-contrast)] bg-[var(--color-primary-default)] hover:bg-[var(--color-primary-dark)] rounded-xl transition-colors shadow-sm disabled:opacity-50"
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
