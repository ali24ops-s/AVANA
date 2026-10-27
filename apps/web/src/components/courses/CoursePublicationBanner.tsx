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
} from "lucide-react";
import { Button, Badge } from "@avana/ui";
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
}

export function CoursePublicationBanner({
  organizationId,
  courseId,
  courseTitle,
  courseDescription,
  courseSubject,
  isOfficial = false,
}: CoursePublicationBannerProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
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

  const isCourseAlreadyPublished = Boolean(
    publishedPublication && publishedPublication.status === "published",
  );
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
        ) : status === "published" || isCourseAlreadyPublished ? (
          /* State 2: Published in Library with Update Option */
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

            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsModalOpen(true)}
              className="text-xs bg-[#008080] hover:bg-[#006666] text-white font-bold flex-shrink-0 self-start sm:self-center"
              data-testid="request-update-cta-button"
            >
              <Sparkles className="w-3.5 h-3.5 ml-1.5" />
              <span>درخواست به‌روزرسانی دوره</span>
            </Button>
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
    </>
  );
}
