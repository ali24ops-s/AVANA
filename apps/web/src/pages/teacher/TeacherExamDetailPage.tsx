/**
 * TeacherExamDetailPage.
 *
 * Comprehensive view of an exam for teachers:
 *  - Displays metadata, schedule, duration, passing score, rules, and question bank.
 *  - Server-authoritative lifecycle actions:
 *     - Draft: Edit questions, publish exam, archive exam.
 *     - Published (upcoming / active / closed): Unpublish (409 conflict handled),
 *       manual close, release results, view results, archive.
 *     - Archived: Read-only overview, view results.
 *  - Question bank preview showing points, options, correct answers, and explanations.
 */

import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  useTeacherExam,
  useExamQuestions,
  usePublishExam,
  useUnpublishExam,
  useCloseExam,
  useReleaseExamResults,
  useArchiveExam,
} from "../../hooks/useTeacher.js";
import {
  PageHeader,
  Card,
  Button,
  Badge,
  Alert,
  LoadingState,
  EmptyState,
} from "../../components/ui/index.js";
import { ExamStatusBadge } from "../../components/teacher/exams/ExamStatusBadge.js";
import { PublishConfirmModal } from "../../components/teacher/exams/PublishConfirmModal.js";
import { ConfirmModal } from "../../components/teacher/common/ConfirmModal.js";
import {
  formatPersianExamDate,
  formatPersianExamDateTime,
  formatPersianExamTimeRange,
  formatPersianTimeOnly,
} from "../../utils/date.js";
import { ApiError } from "../../lib/api/errors.js";
import {
  Clock,
  Calendar,
  CheckCircle,
  FileQuestion,
  Award,
  Edit,
  Send,
  Eye,
  Archive,
  AlertTriangle,
  Shuffle,
  Users,
  Check,
  StopCircle,
  Unlock,
} from "lucide-react";

export function TeacherExamDetailPage() {
  const { examId } = useParams<{ examId: string }>();

  const examQuery = useTeacherExam(examId);
  const questionsQuery = useExamQuestions(examId);

  const exam = examQuery.data?.exam;
  const questions = questionsQuery.data?.questions ?? [];

  // Mutations
  const publishMutation = usePublishExam(examId ?? "", exam?.classroomId);
  const unpublishMutation = useUnpublishExam(examId ?? "", exam?.classroomId);
  const closeMutation = useCloseExam(examId ?? "", exam?.classroomId);
  const releaseResultsMutation = useReleaseExamResults(examId ?? "");
  const archiveMutation = useArchiveExam(examId ?? "", exam?.classroomId);

  // Modals state
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [unpublishModalOpen, setUnpublishModalOpen] = useState(false);
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [releaseModalOpen, setReleaseModalOpen] = useState(false);
  const [archiveModalOpen, setArchiveModalOpen] = useState(false);

  // Error & Success Feedback
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  if (examQuery.isLoading) {
    return <LoadingState message="در حال بارگذاری جزئیات آزمون..." />;
  }

  if (examQuery.isError || !exam) {
    return (
      <EmptyState
        title="آزمون یافت نشد"
        description="اطلاعات آزمون مورد نظر در دسترس نیست یا حذف شده است."
        action={
          <Link to="/teacher/classrooms">
            <Button variant="primary">بازگشت به کلاس‌ها</Button>
          </Link>
        }
      />
    );
  }

  const isDraft = exam.status === "draft";
  const isPublished = exam.status === "published";
  const isArchived = exam.status === "archived";
  const runtimeState = exam.runtimeState;

  const totalPoints = questions.reduce((sum, q) => sum + (q.points || 0), 0);

  const formatDateTime = (isoString?: string | null) => {
    if (!isoString) return "تعیین نشده";
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return "تعیین نشده";
      const persianDate = formatPersianExamDate(d);
      const time = d.toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" });
      return `${persianDate} - ساعت ${time}`;
    } catch {
      return isoString;
    }
  };

  // Action handlers
  const handlePublishConfirm = async () => {
    setActionError(null);
    try {
      await publishMutation.mutateAsync();
      setActionSuccess("آزمون با موفقیت منتشر شد.");
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "خطا در انتشار آزمون";
      setActionError(msg);
      throw err;
    }
  };

  const handleUnpublishConfirm = async () => {
    setActionError(null);
    try {
      await unpublishMutation.mutateAsync();
      setUnpublishModalOpen(false);
      setActionSuccess("آزمون به وضعیت پیش‌نویس بازگردانده شد.");
    } catch (err) {
      const msg =
        err instanceof ApiError && (err.statusCode === 409 || err.code === "conflict")
          ? "امکان لغو انتشار این آزمون وجود ندارد زیرا حداقل یک دانش‌آموز آزمون را آغاز کرده یا پاسخ داده است."
          : err instanceof Error
            ? err.message
            : "خطا در لغو انتشار آزمون";
      setActionError(msg);
      throw err;
    }
  };

  const handleCloseConfirm = async () => {
    setActionError(null);
    try {
      await closeMutation.mutateAsync();
      setCloseModalOpen(false);
      setActionSuccess("آزمون با موفقیت بسته شد.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "خطا در بستن آزمون";
      setActionError(msg);
      throw err;
    }
  };

  const handleReleaseResultsConfirm = async () => {
    setActionError(null);
    try {
      await releaseResultsMutation.mutateAsync();
      setReleaseModalOpen(false);
      setActionSuccess("کارنامه‌ها با موفقیت برای دانش‌آموزان منتشر شد.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "خطا در انتشار کارنامه‌ها";
      setActionError(msg);
      throw err;
    }
  };

  const handleArchiveConfirm = async () => {
    setActionError(null);
    try {
      await archiveMutation.mutateAsync();
      setArchiveModalOpen(false);
      setActionSuccess("آزمون با موفقیت بایگانی شد.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "خطا در بایگانی آزمون";
      setActionError(msg);
      throw err;
    }
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumb & Navigation */}
      <div className="flex items-center gap-2 text-xs sm:text-sm text-[var(--color-text-muted)]">
        <Link to="/teacher/classrooms" className="hover:text-[#008080] transition-colors">
          کلاس‌های درس
        </Link>
        <span>/</span>
        <Link
          to={`/teacher/classrooms/${exam.classroomId}`}
          className="hover:text-[#008080] transition-colors"
        >
          کلاس
        </Link>
        <span>/</span>
        <span className="text-[var(--color-text)] font-semibold truncate max-w-[200px] sm:max-w-xs">
          {exam.title}
        </span>
      </div>

      {/* Page Header */}
      <PageHeader
        title={
          <div className="flex items-center gap-3 flex-wrap">
            <span>{exam.title}</span>
            <ExamStatusBadge exam={exam} />
            {exam.resultsReleasedAt && (
              <Badge variant="success">کارنامه‌ها منتشر شده</Badge>
            )}
          </div>
        }
        description={exam.description || "جزئیات، زمان‌بندی، سوالات و وضعیت آزمون"}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {/* Draft Actions */}
            {isDraft && (
              <>
                <Link to={`/teacher/exams/${exam.id}/edit`}>
                  <Button variant="outline" className="gap-2">
                    <Edit className="w-4 h-4" />
                    ویرایش سوالات و تنظیمات
                  </Button>
                </Link>
                <Button
                  variant="primary"
                  onClick={() => setPublishModalOpen(true)}
                  disabled={questions.length === 0}
                  className="gap-2"
                >
                  <Send className="w-4 h-4" />
                  انتشار آزمون
                </Button>
              </>
            )}

            {/* Published Actions */}
            {isPublished && (
              <>
                <Link to={`/teacher/exams/${exam.id}/results`}>
                  <Button variant="primary" className="gap-2">
                    <Eye className="w-4 h-4" />
                    کارنامه‌ها و نتایج
                  </Button>
                </Link>

                {!exam.resultsReleasedAt && (
                  <Button
                    variant="outline"
                    onClick={() => setReleaseModalOpen(true)}
                    className="gap-2 text-[#008080] border-[#008080]/30 hover:bg-[#008080]/5"
                  >
                    <Award className="w-4 h-4" />
                    انتشار کارنامه‌ها
                  </Button>
                )}

                {runtimeState === "active" && (
                  <Button
                    variant="outline"
                    onClick={() => setCloseModalOpen(true)}
                    className="gap-2 text-amber-600 border-amber-300 hover:bg-amber-50"
                  >
                    <StopCircle className="w-4 h-4" />
                    پایان دستی آزمون
                  </Button>
                )}

                {(runtimeState === "upcoming" || runtimeState === "active") && (
                  <Button
                    variant="outline"
                    onClick={() => setUnpublishModalOpen(true)}
                    className="gap-2 text-slate-600 border-slate-300 hover:bg-slate-50"
                  >
                    <Unlock className="w-4 h-4" />
                    لغو انتشار
                  </Button>
                )}
              </>
            )}

            {/* Archived Actions */}
            {isArchived && (
              <Link to={`/teacher/exams/${exam.id}/results`}>
                <Button variant="primary" className="gap-2">
                  <Eye className="w-4 h-4" />
                  مشاهده نتایج آزمون
                </Button>
              </Link>
            )}

            {/* Archive Action for Draft or Published */}
            {!isArchived && (
              <Button
                variant="outline"
                onClick={() => setArchiveModalOpen(true)}
                className="gap-2 text-rose-600 border-rose-200 hover:bg-rose-50"
              >
                <Archive className="w-4 h-4" />
                بایگانی آزمون
              </Button>
            )}
          </div>
        }
      />

      {/* Notifications */}
      {actionError && (
        <Alert variant="error" title="خطا در عملیات" className="mt-2">
          {actionError}
        </Alert>
      )}

      {actionSuccess && (
        <Alert variant="success" title="موفقیت‌آمیز" className="mt-2">
          {actionSuccess}
        </Alert>
      )}

      {/* Metadata Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#008080]/10 text-[#008080] flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-[var(--color-text-muted)]">مدت زمان آزمون</div>
            <div className="text-sm font-bold text-[var(--color-text)] mt-0.5">
              {exam.durationMinutes ? `${exam.durationMinutes} دقیقه` : "نامحدود (کل بازه)"}
            </div>
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
            <Award className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-[var(--color-text-muted)]">حد نصاب قبولی</div>
            <div className="text-sm font-bold text-[var(--color-text)] mt-0.5">
              {exam.passingScorePercentage !== null && exam.passingScorePercentage !== undefined
                ? `${exam.passingScorePercentage}٪ نمره کل`
                : "بدون حد نصاب"}
            </div>
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center shrink-0">
            <FileQuestion className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-[var(--color-text-muted)]">تعداد و بارم سوالات</div>
            <div className="text-sm font-bold text-[var(--color-text)] mt-0.5">
              {questions.length} سوال ({totalPoints} نمره)
            </div>
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-[var(--color-text-muted)]">زمان برگزاری</div>
            <div className="text-xs font-semibold text-[var(--color-text)] mt-0.5 truncate max-w-[180px]">
              {formatPersianExamTimeRange(exam.startsAt, exam.endsAt)}
            </div>
          </div>
        </Card>
      </div>

      {/* Schedule & Policy Details */}
      <Card className="p-5">
        <h3 className="text-sm sm:text-base font-bold text-[var(--color-text)] mb-4 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-[#008080]" />
          زمان‌بندی و قوانین برگزاری آزمون
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs sm:text-sm">
          <div className="bg-[var(--color-surface-warm)]/50 p-3 rounded-xl border border-[var(--color-border)]">
            <span className="text-[var(--color-text-muted)] block text-xs">تاریخ آزمون:</span>
            <span className="font-semibold text-[var(--color-text)] mt-1 block">
              {formatPersianExamDate(exam.startsAt)}
            </span>
          </div>

          <div className="bg-[var(--color-surface-warm)]/50 p-3 rounded-xl border border-[var(--color-border)]">
            <span className="text-[var(--color-text-muted)] block text-xs">ساعت شروع:</span>
            <span className="font-semibold text-[var(--color-text)] mt-1 block">
              {formatPersianTimeOnly(exam.startsAt)}
            </span>
          </div>

          <div className="bg-[var(--color-surface-warm)]/50 p-3 rounded-xl border border-[var(--color-border)]">
            <span className="text-[var(--color-text-muted)] block text-xs">ساعت پایان:</span>
            <span className="font-semibold text-[var(--color-text)] mt-1 block">
              {formatPersianTimeOnly(exam.endsAt)}
            </span>
          </div>

          <div className="bg-[var(--color-surface-warm)]/50 p-3 rounded-xl border border-[var(--color-border)]">
            <span className="text-[var(--color-text-muted)] block text-xs">انتشار کارنامه:</span>
            <span className="font-semibold text-[var(--color-text)] mt-1 block">
              {exam.resultsReleasedAt
                ? `منتشر شده در ${formatPersianExamDateTime(exam.resultsReleasedAt)}`
                : exam.showResultsImmediately
                  ? "نمایش فوری پس از تحویل"
                  : "پس از تأیید و انتشار دستی معلم"}
            </span>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-[var(--color-border)] flex flex-wrap gap-4 text-xs">
          <div className="flex items-center gap-1.5 text-[var(--color-text-muted)]">
            <Shuffle className="w-3.5 h-3.5 text-[#008080]" />
            <span>ترتیب تصادفی سوالات:</span>
            <span className="font-semibold text-[var(--color-text)]">
              {exam.shuffleQuestions ? "فعال" : "غیرفعال"}
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-[var(--color-text-muted)]">
            <Shuffle className="w-3.5 h-3.5 text-[#008080]" />
            <span>ترتیب تصادفی گزینه‌ها:</span>
            <span className="font-semibold text-[var(--color-text)]">
              {exam.shuffleOptions ? "فعال" : "غیرفعال"}
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-[var(--color-text-muted)]">
            <Users className="w-3.5 h-3.5 text-[#008080]" />
            <span>نمایش خودکار پاسخ‌ها:</span>
            <span className="font-semibold text-[var(--color-text)]">
              {exam.showResultsImmediately ? "بلافاصله" : "دستی"}
            </span>
          </div>
        </div>
      </Card>

      {/* Question Bank Preview */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-base sm:text-lg font-bold text-[var(--color-text)]">
              بانک سوالات آزمون ({questions.length} سوال)
            </h3>
            {isPublished && (
              <Badge variant="warning" outlined className="text-xs bg-amber-500/10 text-amber-700 border-amber-300">
                قفل شده (غیرقابل تغییر)
              </Badge>
            )}
          </div>

          {isDraft && (
            <Link to={`/teacher/exams/${exam.id}/edit`}>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Edit className="w-3.5 h-3.5" />
                ویرایش سوالات
              </Button>
            </Link>
          )}
        </div>

        {questionsQuery.isLoading ? (
          <LoadingState message="در حال دریافت سوالات..." />
        ) : questions.length === 0 ? (
          <Card className="p-8 text-center border-dashed">
            <FileQuestion className="w-10 h-10 text-[var(--color-text-muted)]/50 mx-auto mb-3" />
            <h4 className="text-sm font-bold text-[var(--color-text)] mb-1">
              هنوز سوالی برای این آزمون ثبت نشده است
            </h4>
            <p className="text-xs text-[var(--color-text-muted)] mb-4">
              برای فعال‌سازی و انتشار این آزمون، ابتدا باید سوالات آن را طراحی کنید.
            </p>
            {isDraft && (
              <Link to={`/teacher/exams/${exam.id}/edit`}>
                <Button variant="primary" size="sm" className="gap-2">
                  <Edit className="w-4 h-4" />
                  طراحی سوالات در ویرایشگر
                </Button>
              </Link>
            )}
          </Card>
        ) : (
          <div className="space-y-4">
            {questions.map((question, idx) => (
              <Card key={question.id} className="p-5">
                {/* Question Header */}
                <div className="flex items-start justify-between gap-4 pb-3 border-b border-[var(--color-border)] mb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-[var(--color-surface-warm)] text-[var(--color-text)] text-xs font-bold flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    <span className="text-xs font-medium text-[var(--color-text-muted)]">
                      سوال شماره {idx + 1}
                    </span>
                  </div>
                  <Badge variant="neutral" outlined className="font-semibold text-xs">
                    {question.points} نمره
                  </Badge>
                </div>

                {/* Prompt */}
                <p className="text-sm sm:text-base font-semibold text-[var(--color-text)] leading-relaxed whitespace-pre-wrap mb-4">
                  {question.prompt}
                </p>

                {/* Options List */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {(question.options ?? []).map((opt) => {
                    const isCorrect = opt.id === question.correctOptionId;
                    return (
                      <div
                        key={opt.id}
                        className={`p-3 rounded-xl border text-xs sm:text-sm flex items-center justify-between gap-2 transition-colors ${
                          isCorrect
                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-900 font-medium"
                            : "bg-[var(--color-surface-warm)]/40 border-[var(--color-border)] text-[var(--color-text)]"
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <span
                            className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                              isCorrect
                                ? "bg-emerald-600 text-white"
                                : "bg-[var(--color-border)] text-[var(--color-text-muted)]"
                            }`}
                          >
                            {opt.id.replace("opt_", "")}
                          </span>
                          <span className="truncate">{opt.text}</span>
                        </div>
                        {isCorrect && (
                          <div className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 shrink-0">
                            <Check className="w-3.5 h-3.5" />
                            <span>پاسخ صحیح</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Explanation */}
                {question.explanation && (
                  <div className="mt-4 p-3 rounded-xl bg-amber-500/5 border border-amber-200/50 text-xs text-amber-900 leading-relaxed">
                    <span className="font-bold block mb-1">توضیح پاسخ تشریحی:</span>
                    <span>{question.explanation}</span>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      <PublishConfirmModal
        isOpen={publishModalOpen}
        onClose={() => setPublishModalOpen(false)}
        onConfirm={handlePublishConfirm}
        isPublishing={publishMutation.isPending}
        questionsCount={questions.length}
        startsAt={exam.startsAt ?? ""}
        endsAt={exam.endsAt ?? ""}
      />

      <ConfirmModal
        isOpen={unpublishModalOpen}
        onCancel={() => setUnpublishModalOpen(false)}
        onConfirm={handleUnpublishConfirm}
        title="لغو انتشار آزمون"
        description="با لغو انتشار، آزمون به پیش‌نویس بازمی‌گردد و دسترسی دانش‌آموزان موقتاً قطع می‌شود. توجه: در صورتی که دانش‌آموزی آزمون را آغاز کرده باشد، سرور اجازه لغو انتشار نخواهد داد."
        confirmText="لغو انتشار آزمون"
        cancelText="انصراف"
        variant="warning"
        isProcessing={unpublishMutation.isPending}
      />

      <ConfirmModal
        isOpen={closeModalOpen}
        onCancel={() => setCloseModalOpen(false)}
        onConfirm={handleCloseConfirm}
        title="بستن دستی آزمون"
        description="آیا از بستن دستی این آزمون اطمینان دارید؟ پس از بستن، هیچ دانش‌آموزی قادر به شروع یا ادامه آزمون نخواهد بود."
        confirmText="پایان دادن به آزمون"
        cancelText="انصراف"
        variant="warning"
        isProcessing={closeMutation.isPending}
      />

      <ConfirmModal
        isOpen={releaseModalOpen}
        onCancel={() => setReleaseModalOpen(false)}
        onConfirm={handleReleaseResultsConfirm}
        title="انتشار کارنامه‌ها برای دانش‌آموزان"
        description="با تأیید این عملیات، کارنامه تفصیلی و نمره نهایی برای تمامی دانش‌آموزانی که در آزمون شرکت کرده‌اند در پنل آن‌ها قابل مشاهده خواهد شد."
        confirmText="انتشار رسمی کارنامه‌ها"
        cancelText="انصراف"
        variant="primary"
        isProcessing={releaseResultsMutation.isPending}
      />

      <ConfirmModal
        isOpen={archiveModalOpen}
        onCancel={() => setArchiveModalOpen(false)}
        onConfirm={handleArchiveConfirm}
        title="بایگانی کردن آزمون"
        description="با بایگانی آزمون، این ارزیابی از فهرست فعال کلاس خارج شده و به آرشیو منتقل می‌شود. سوابق دانش‌آموزان محفوظ خواهد ماند."
        confirmText="بایگانی آزمون"
        cancelText="انصراف"
        variant="danger"
        isProcessing={archiveMutation.isPending}
      />
    </div>
  );
}
