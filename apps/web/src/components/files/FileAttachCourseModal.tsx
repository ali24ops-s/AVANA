import { useState } from "react";
import { BookOpen, Loader2 } from "lucide-react";
import { Dialog, DialogHeader, DialogContent, AvanaSelect } from "@avana/ui";
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onConfirm(selectedCourseId ? selectedCourseId : null);
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={() => !isSaving && onClose()}
      maxWidth="md"
      ariaLabel={count > 1 ? `اتصال ${count.toLocaleString("fa-IR")} فایل به دوره` : "اتصال / تغییر دوره فایل"}
    >
      {/* Header */}
      <DialogHeader onClose={!isSaving ? onClose : undefined}>
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-[var(--color-text)]">
              {count > 1
                ? `اتصال ${count.toLocaleString("fa-IR")} فایل به دوره`
                : "اتصال / تغییر دوره فایل"}
            </h3>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              دوره مورد نظر را برای دسته‌بندی فایل انتخاب کنید
            </p>
          </div>
        </div>
      </DialogHeader>

      {/* Form Content */}
      <DialogContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <AvanaSelect
            label="انتخاب دوره آموزشی:"
            value={selectedCourseId}
            onChange={(val) => setSelectedCourseId(typeof val === "string" ? val : val[0] || "")}
            disabled={isSaving}
            options={[
              { value: "", label: "بدون اتصال به دوره (آزاد / Unassigned)" },
              ...courses.map((c) => ({ value: c.id, label: c.title })),
            ]}
          />

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--color-border)]">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] transition-colors disabled:opacity-50 cursor-pointer"
            >
              انصراف
            </button>

            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-[#008080] hover:bg-[#006666] text-white text-xs font-bold transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
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
      </DialogContent>
    </Dialog>
  );
}
