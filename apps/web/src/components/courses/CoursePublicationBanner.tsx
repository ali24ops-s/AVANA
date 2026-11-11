import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Share2,
  Clock,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Sparkles,
  Loader2,
  EyeOff,
  BookOpen,
} from "lucide-react";
import { Button, Badge, Dialog, DialogContent, DialogHeader } from "@avana/ui";
import { createApiClient, getApiBaseUrl } from "../../lib/api/client.js";
import { createCourseApi } from "../../lib/api/courses.js";
import { RequestCoursePublishModal } from "./RequestCoursePublishModal.js";

export interface CoursePublicationBannerProps {
  organizationId: string;
  courseId: string;
  courseTitle: string;
  courseDescription?: string | null;
  courseSubject?: string | null;
  isOfficial?: boolean;
  canEdit?: boolean;
  isOwner?: boolean;
  isEnrolled?: boolean;
}

export function CoursePublicationBanner({
  organizationId,
  courseId,
  courseTitle,
  courseDescription,
  courseSubject,
  isOfficial = false,
  canEdit: propCanEdit,
}: CoursePublicationBannerProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isUnpublishModalOpen, setIsUnpublishModalOpen] = useState(false);
  const [isUnpublishing, setIsUnpublishing] = useState(false);
  const [unpublishError, setUnpublishError] = useState<string | null>(null);

  const queryClient = useQueryClient();

  const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
  const courseApi = createCourseApi(apiClient);

  const publicationQuery = useQuery({
    queryKey: ["course-publication-status", organizationId, courseId],
    queryFn: () => courseApi.getCoursePublicationStatus(organizationId, courseId),
    enabled: !!organizationId && !!courseId && !isOfficial,
  });

  // If official course, publication is handled by Admin studio
  if (isOfficial) {
    return null;
  }

  const isOfficialFromQuery = publicationQuery.data?.isOfficial === true;
  if (isOfficialFromQuery) {
    return null;
  }

  const publication = publicationQuery.data?.publication;
  const publishedPublication = publicationQuery.data?.publishedPublication;
  const status = publication?.status;

  const canEdit =
    publicationQuery.data?.canEdit !== undefined
      ? publicationQuery.data.canEdit
      : (propCanEdit ?? true);

  const isCourseAlreadyPublished = Boolean(
    publishedPublication && publishedPublication.status === "published",
  );
  const isCourseUnpublished =
    status === "unpublished" ||
    (!isCourseAlreadyPublished &&
      (publication?.status === "unpublished" ||
        publication?.status === "superseded" ||
        publication?.status === "cancelled"));

  const isUpdatePending =
    isCourseAlreadyPublished &&
    publication &&
    publication.id !== publishedPublication?.id &&
    status === "pending_review";
  const isUpdateChangesRequested =
    isCourseAlreadyPublished && status === "changes_requested";
  const isUpdateRejected =
    isCourseAlreadyPublished &&
    publication &&
    publication.id !== publishedPublication?.id &&
    status === "rejected";

  const handleSubmitted = () => {
    void queryClient.invalidateQueries({
      queryKey: ["course-publication-status", organizationId, courseId],
    });
    void queryClient.invalidateQueries({
      queryKey: ["course", organizationId, courseId],
    });
    void queryClient.invalidateQueries({
      queryKey: ["course-learning", organizationId, courseId],
    });
    void queryClient.invalidateQueries({
      queryKey: ["course-structure", organizationId, courseId],
    });
  };

  const handleUnpublish = async () => {
    setIsUnpublishing(true);
    setUnpublishError(null);
    try {
      await courseApi.unpublishCourse(organizationId, courseId);
      setIsUnpublishModalOpen(false);
      handleSubmitted();
    } catch (err: unknown) {
      setUnpublishError(
        err instanceof Error ? err.message : "خطا در خارج کردن دوره از انتشار",
      );
    } finally {
      setIsUnpublishing(false);
    }
  };

  // If user does not have edit permissions (e.g. enrolled learner / recipient), show read-only info
  if (!canEdit) {
    return (
      <div
        className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-4 sm:p-5 shadow-xs transition-all"
        dir="rtl"
        data-testid="course-shared-banner"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-teal-500/10 border border-teal-500/20 text-[#008080] flex items-center justify-center flex-shrink-0">
            <BookOpen className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-[var(--color-text)]">
                دوره اشتراک‌گذاری‌شده:
              </span>
              <Badge className="bg-teal-500/10 text-[#008080] border-teal-500/20 text-[11px] font-bold">
                نسخه کتابخانه‌ای (فقط خواندنی)
              </Badge>
            </div>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              شما به محتوای این دوره، آزمون‌ها و فلش‌کارت‌ها دسترسی کامل دارید. مدیریت محتوا، انتشار و اسناد فقط در اختیار سازنده اصلی دوره است.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-4 sm:p-5 shadow-xs transition-all"
        dir="rtl"
        data-testid="course-publication-banner"
      >
        {publicationQuery.isLoading ? (
          <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)] py-1">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-[#008080]" />
            <span>در حال بررسی وضعیت انتشار...</span>
          </div>
        ) : isUpdatePending ? (
          /* State: Update Pending Admin Review */
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start sm:items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center flex-shrink-0">
                <Clock className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-[var(--color-text)]">
                    وضعیت انتشار در کتابخانه:
                  </span>
                  <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 text-[11px] font-bold">
                    <Clock className="w-3 h-3 ml-1" />
                    در انتظار بررسی به‌روزرسانی (نسخه {publication?.version})
                  </Badge>
                  <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                    (نسخه {publishedPublication?.version} هم‌اکنون فعال است)
                  </span>
                </div>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                  درخواست به‌روزرسانی محتوای این دوره در صف بررسی ادمین قرار دارد. تا زمان تأیید، نسخه فعلی همچنان برای فراگیران بدون وقفه قابل استفاده است.
                </p>
              </div>
            </div>
          </div>
        ) : isUpdateChangesRequested || status === "changes_requested" ? (
          /* State: Changes Requested by Admin */
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start sm:items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-[var(--color-text)]">
                    وضعیت انتشار در کتابخانه:
                  </span>
                  <Badge className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 text-[11px] font-bold">
                    نیازمند اصلاح محتوا
                  </Badge>
                </div>
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
                  {publication?.reviewNotes || (publication?.metadata as any)?.reviewNotes
                    ? `توضیحات ادمین: ${publication?.reviewNotes || (publication?.metadata as any)?.reviewNotes}`
                    : "درخواست انتشار دوره نیازمند انجام برخی اصلاحات است."}
                </p>
              </div>
            </div>

            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsModalOpen(true)}
              className="text-xs bg-[#008080] hover:bg-[#006666] text-white font-bold flex-shrink-0 self-start sm:self-center"
              data-testid="request-update-resubmit-button"
            >
              <RotateCcw className="w-3.5 h-3.5 ml-1.5" />
              <span>ارسال مجدد پس از اصلاح</span>
            </Button>
          </div>
        ) : status === "pending_review" ? (
          /* State 1: Initial Pending Admin Review */
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start sm:items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center flex-shrink-0">
                <Clock className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-[var(--color-text)]">
                    وضعیت انتشار در کتابخانه:
                  </span>
                  <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 text-[11px] font-bold">
                    <Clock className="w-3 h-3 ml-1" />
                    در انتظار بررسی ادمین
                  </Badge>
                </div>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                  درخواست انتشار این دوره ثبت شده و در صف بررسی تیم مدیریت محتوای آوانا قرار دارد.
                </p>
              </div>
            </div>
          </div>
        ) : isUpdateRejected ? (
          /* State: Update Rejected */
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start sm:items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-[var(--color-text)]">
                    وضعیت انتشار در کتابخانه:
                  </span>
                  <Badge className="bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20 text-[11px] font-bold">
                    رد درخواست به‌روزرسانی
                  </Badge>
                  <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                    (نسخه {publishedPublication?.version} همچنان در کتابخانه فعال است)
                  </span>
                </div>
                <p className="text-xs text-rose-600 dark:text-rose-400 mt-0.5">
                  {publication?.rejectionReason
                    ? `علت عدم تأیید: ${publication.rejectionReason}`
                    : "آخرین درخواست به‌روزرسانی مورد تأیید قرار نگرفت."}
                </p>
              </div>
            </div>

            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsModalOpen(true)}
              className="text-xs bg-[#008080] hover:bg-[#006666] text-white font-bold flex-shrink-0 self-start sm:self-center"
              data-testid="request-update-retry-button"
            >
              <RotateCcw className="w-3.5 h-3.5 ml-1.5" />
              <span>درخواست مجدد به‌روزرسانی</span>
            </Button>
          </div>
        ) : isCourseUnpublished ? (
          /* State: Unpublished */
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start sm:items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-neutral-500/10 border border-neutral-500/20 text-neutral-600 dark:text-neutral-400 flex items-center justify-center flex-shrink-0">
                <EyeOff className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-[var(--color-text)]">
                    وضعیت انتشار در کتابخانه:
                  </span>
                  <Badge className="bg-neutral-500/10 text-neutral-600 dark:text-neutral-400 border-neutral-500/20 text-[11px] font-bold">
                    <EyeOff className="w-3 h-3 ml-1" />
                    از انتشار خارج شده
                  </Badge>
                </div>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                  این دوره از کتابخانه عمومی خارج شده است. فراگیرانی که قبلاً دوره را اضافه کرده‌اند همچنان به محتوای آن دسترسی دارند، اما دوره دیگر برای کاربران جدید نمایش داده نمی‌شود.
                </p>
              </div>
            </div>

            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsModalOpen(true)}
              className="text-xs bg-[#008080] hover:bg-[#006666] text-white font-bold flex-shrink-0 self-start sm:self-center"
              data-testid="request-publish-cta-button"
            >
              <Sparkles className="w-3.5 h-3.5 ml-1.5" />
              <span>درخواست انتشار مجدد</span>
            </Button>
          </div>
        ) : status === "published" || isCourseAlreadyPublished ? (
          /* State 2: Published in Library with Update & Unpublish Options */
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start sm:items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-[var(--color-text)]">
                    وضعیت انتشار در کتابخانه:
                  </span>
                  <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[11px] font-bold">
                    <CheckCircle2 className="w-3 h-3 ml-1" />
                    منتشر شده در کتابخانه
                  </Badge>
                  {(publishedPublication?.version ?? publication?.version) && (
                    <span className="text-xs text-[var(--color-text-muted)] font-medium">
                      (نسخه {publishedPublication?.version ?? publication?.version})
                    </span>
                  )}
                </div>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                  این دوره با موفقیت بررسی شده و در کتابخانه عمومی آوانا در دسترس همگان قرار دارد. پس از افزودن یا ویرایش درس‌ها می‌توانید درخواست به‌روزرسانی ثبت کنید.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap flex-shrink-0 self-start sm:self-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsUnpublishModalOpen(true)}
                className="text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 font-bold"
                data-testid="unpublish-course-button"
              >
                <EyeOff className="w-3.5 h-3.5 ml-1.5" />
                <span>خارج کردن از انتشار</span>
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setIsModalOpen(true)}
                className="text-xs bg-[#008080] hover:bg-[#006666] text-white font-bold"
                data-testid="request-update-cta-button"
              >
                <Sparkles className="w-3.5 h-3.5 ml-1.5" />
                <span>درخواست به‌روزرسانی دوره</span>
              </Button>
            </div>
          </div>
        ) : status === "rejected" ? (
          /* State 3: Initial Rejection with reason & retry option */
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start sm:items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-[var(--color-text)]">
                    وضعیت انتشار در کتابخانه:
                  </span>
                  <Badge className="bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20 text-[11px] font-bold">
                    رد شده
                  </Badge>
                </div>
                <p className="text-xs text-rose-600 dark:text-rose-400 mt-0.5">
                  {publication?.rejectionReason
                    ? `علت عدم تأیید: ${publication.rejectionReason}`
                    : "درخواست انتشار این دوره مورد تأیید قرار نگرفت."}
                </p>
              </div>
            </div>

            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsModalOpen(true)}
              className="text-xs bg-[#008080] hover:bg-[#006666] text-white font-bold flex-shrink-0 self-start sm:self-center"
            >
              <RotateCcw className="w-3.5 h-3.5 ml-1.5" />
              <span>درخواست مجدد انتشار</span>
            </Button>
          </div>
        ) : (
          /* State 4: Not submitted / Draft */
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start sm:items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-teal-500/10 border border-teal-500/20 text-[#008080] flex items-center justify-center flex-shrink-0">
                <Share2 className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-xs font-bold text-[var(--color-text)]">
                  اشتراک‌گذاری و انتشار دوره در کتابخانه
                </h3>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                  می‌توانید درخواست بررسی و انتشار این دوره را به تیم محتوای آوانا ارسال کنید.
                </p>
              </div>
            </div>

            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsModalOpen(true)}
              className="text-xs bg-[#008080] hover:bg-[#006666] text-white font-bold flex-shrink-0 self-start sm:self-center"
              data-testid="request-publish-cta-button"
            >
              <Sparkles className="w-3.5 h-3.5 ml-1.5" />
              <span>درخواست انتشار در کتابخانه</span>
            </Button>
          </div>
        )}
      </div>

      <RequestCoursePublishModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        organizationId={organizationId}
        courseId={courseId}
        courseTitle={courseTitle}
        courseDescription={courseDescription}
        courseSubject={courseSubject}
        isUpdate={isCourseAlreadyPublished}
        currentVersion={publishedPublication?.version ?? publication?.version ?? 1}
        onSubmitted={handleSubmitted}
      />

      {/* Unpublish Confirmation Modal */}
      <Dialog
        isOpen={isUnpublishModalOpen}
        onClose={() => !isUnpublishing && setIsUnpublishModalOpen(false)}
        maxWidth="md"
        ariaLabel="خارج کردن دوره از حالت انتشار"
      >
        <DialogHeader
          onClose={() => !isUnpublishing && setIsUnpublishModalOpen(false)}
          className="p-5 bg-[var(--color-surface-subtle)] border-b border-[var(--color-border)]"
        >
          <div className="flex items-center gap-3" dir="rtl">
            <div className="w-10 h-10 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-600 flex items-center justify-center flex-shrink-0">
              <EyeOff className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--color-text)]">
                خارج کردن دوره از کتابخانه
              </h2>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                تغییر وضعیت دوره به حالت منتشر نشده
              </p>
            </div>
          </div>
        </DialogHeader>

        <DialogContent className="p-5 space-y-4">
          <p className="text-sm text-[var(--color-text)] leading-relaxed">
            آیا از خارج کردن دوره <span className="font-bold text-[var(--color-text)]">«{courseTitle}»</span> از کتابخانه عمومی اطمینان دارید؟
          </p>

          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-400 space-y-1">
            <p className="font-bold flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>نکات مهم پس از خروج از انتشار:</span>
            </p>
            <ul className="list-disc list-inside space-y-0.5 pr-1 text-[11px]">
              <li>فراگیرانی که قبلاً دوره را اضافه کرده‌اند، همچنان به محتوای این نسخه برای مطالعه، آزمون‌ها و فلش‌کارت‌ها دسترسی خواهند داشت.</li>
              <li>این دوره از کتابخانه عمومی، دسته‌بندی‌ها و جستجو برای کاربران جدید مخفی خواهد شد.</li>
              <li>تاریخچه انتشار و نسخه‌های قبلی دوره محفوظ مانده و هر زمان می‌توانید مجدداً درخواست انتشار ثبت کنید.</li>
            </ul>
          </div>

          {unpublishError && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-600 dark:text-rose-400 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{unpublishError}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-[var(--color-border)]">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsUnpublishModalOpen(false)}
              disabled={isUnpublishing}
            >
              انصراف
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleUnpublish}
              disabled={isUnpublishing}
              className="bg-rose-600 hover:bg-rose-700 text-white font-bold"
              data-testid="confirm-unpublish-button"
            >
              {isUnpublishing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 ml-1.5 animate-spin" />
                  <span>در حال خارج کردن...</span>
                </>
              ) : (
                <>
                  <EyeOff className="w-3.5 h-3.5 ml-1.5" />
                  <span>تأیید و خروج از انتشار</span>
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
