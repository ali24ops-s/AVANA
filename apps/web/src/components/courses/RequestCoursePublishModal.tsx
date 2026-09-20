import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, Button } from "@avana/ui";
import {
  Send,
  CheckCircle2,
  AlertCircle,
  Loader2,
  BookOpen,
} from "lucide-react";
import { createApiClient, getApiBaseUrl } from "../../lib/api/client.js";
import { createCourseApi } from "../../lib/api/courses.js";

export interface RequestCoursePublishModalProps {
  isOpen: boolean;
  onClose: () => void;
  organizationId: string;
  courseId: string;
  courseTitle: string;
  courseDescription?: string | null;
  courseSubject?: string | null;
  isOfficial?: boolean;
  onSubmitted?: () => void;
}

export function RequestCoursePublishModal({
  isOpen,
  onClose,
  organizationId,
  courseId,
  courseTitle,
  courseDescription,
  courseSubject,
  isOfficial = false,
  onSubmitted,
}: RequestCoursePublishModalProps) {
  if (isOfficial) {
    return null;
  }

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
  const courseApi = createCourseApi(apiClient);

  const handleConfirm = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      await courseApi.publishCourse(organizationId, courseId, {
        title: courseTitle,
        description: courseDescription || null,
        subject: courseSubject || null,
      });
      setSuccess(true);
      if (onSubmitted) {
        onSubmitted();
      }
      setTimeout(() => {
        onClose();
        setSuccess(false);
      }, 1500);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "خطا در ثبت درخواست انتشار در کتابخانه",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="md"
      ariaLabel="درخواست انتشار دوره در کتابخانه"
    >
      <DialogHeader
        onClose={onClose}
        className="p-5 bg-[var(--color-surface-subtle)] border-b border-[var(--color-border)]"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 text-[#008080] flex items-center justify-center flex-shrink-0">
            <Send className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-[var(--color-text)]">
              درخواست انتشار دوره در کتابخانه
            </h2>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              ارسال جهت بررسی و آماده‌سازی نهایی توسط تیم آوانا
            </p>
          </div>
        </div>
      </DialogHeader>

      <DialogContent className="p-6 space-y-4">
        <div dir="rtl" className="space-y-4">
        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success ? (
          <div className="py-6 text-center space-y-2.5">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto animate-in zoom-in-50 duration-200" />
            <h3 className="text-sm font-bold text-[var(--color-text)]">
              درخواست انتشار با موفقیت ثبت شد!
            </h3>
            <p className="text-xs text-[var(--color-text-muted)] max-w-sm mx-auto">
              دوره شما در صف بررسی تیم مدیریت محتوای آوانا قرار گرفت. وضعیت آن را در بالای همین صفحه می‌توانید مشاهده کنید.
            </p>
          </div>
        ) : (
          <>
            <div className="p-4 bg-[var(--color-surface-subtle)] rounded-2xl border border-[var(--color-border)] space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-[var(--color-text)]">
                <BookOpen className="w-4 h-4 text-[#008080]" />
                <span>{courseTitle}</span>
              </div>
              {courseSubject && (
                <p className="text-xs text-[var(--color-text-muted)]">
                  موضوع: <span className="text-[var(--color-text)]">{courseSubject}</span>
                </p>
              )}
              {courseDescription && (
                <p className="text-xs text-[var(--color-text-muted)] line-clamp-2">
                  {courseDescription}
                </p>
              )}
            </div>

            <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
              با ثبت این درخواست، دوره شما توسط مدیران آوانا بررسی شده، ساختار و محتوای آن آماده‌سازی و در صورت تأیید در کتابخانه عمومی آوانا در دسترس همگان قرار خواهد گرفت.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[var(--color-border)]">
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                disabled={isSubmitting}
                className="text-xs"
              >
                انصراف
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleConfirm}
                disabled={isSubmitting}
                className="text-xs bg-[#008080] hover:bg-[#006666] text-white font-bold"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin ml-1.5" />
                    <span>در حال ثبت درخواست...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5 ml-1.5" />
                    <span>ثبت درخواست انتشار</span>
                  </>
                )}
              </Button>
            </div>
          </>
        )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
