import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogFooter, Button } from "@avana/ui";
import { BookPlus, AlertCircle, Loader2 } from "lucide-react";
import { createApiClient, getApiBaseUrl } from "../../lib/api/client.js";
import { createCourseApi } from "../../lib/api/courses.js";

export interface CreateCourseModalProps {
  isOpen: boolean;
  onClose: () => void;
  organizationId: string;
  onCreated: (courseId: string) => void;
}

export function CreateCourseModal({
  isOpen,
  onClose,
  organizationId,
  onCreated,
}: CreateCourseModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [subject, setSubject] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
  const courseApi = createCourseApi(apiClient);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSubmitting(true);
    setError(null);
    try {
      const res = await courseApi.createCourse(organizationId, {
        title: title.trim(),
        description: description.trim() || null,
        subject: subject.trim() || null,
      });

      const newCourseId = (res as any)?.course?.id || (res as any)?.id;
      if (newCourseId) {
        onCreated(newCourseId);
      }
      onClose();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "خطا در ایجاد دوره جدید",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog isOpen={isOpen} onClose={onClose} maxWidth="md" ariaLabel="ایجاد دوره جدید">
      <DialogHeader onClose={onClose} className="p-6 bg-[var(--color-surface-subtle)] border-b border-[var(--color-border)]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 text-[#008080] flex items-center justify-center flex-shrink-0">
            <BookPlus className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-[var(--color-text)]">
              ایجاد دوره شخصی جدید
            </h2>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              یک دوره مستقل برای یادگیری، دسته‌بندی فایل‌ها و ساخت محتوا بسازید.
            </p>
          </div>
        </div>
      </DialogHeader>

      <DialogContent className="p-0">

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-[var(--color-text)] mb-1.5">
              عنوان دوره <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="مثلاً: ریاضی مهندسی، زبان تخصصی، فیزیک کنکور..."
              className="w-full px-3.5 py-2 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl focus:outline-none focus:border-[#008080]"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--color-text)] mb-1.5">
              موضوع یا رشته
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="مثلاً: مهندسی کامپیوتر، کنکور تجربی..."
              className="w-full px-3.5 py-2 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl focus:outline-none focus:border-[#008080]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--color-text)] mb-1.5">
              توضیحات دوره
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="توضیح کوتاه درباره مباحث و اهداف این دوره..."
              className="w-full px-3.5 py-2 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl focus:outline-none focus:border-[#008080]"
            />
          </div>

          <DialogFooter className="pt-2 flex justify-end gap-2 border-t border-[var(--color-border)]">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
            >
              انصراف
            </Button>
            <Button
              type="submit"
              disabled={!title.trim() || isSubmitting}
              className="bg-[#008080] hover:bg-[#006666] text-white"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin ml-2" />
                  در حال ساخت دوره...
                </>
              ) : (
                "ایجاد دوره"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
