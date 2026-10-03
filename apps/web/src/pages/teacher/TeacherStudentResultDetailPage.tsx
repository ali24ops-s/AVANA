/**
 * TeacherStudentResultDetailPage.
 *
 * Detailed review of an individual student's exam attempt:
 *  - Student profile and attempt metadata (score, percentage, pass/fail, duration)
 *  - Question-by-question review comparing student's selected answer with the authoritative key
 *  - Displays points earned, correctness badges, and full answer explanations
 */

import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import {
  useTeacherExam,
  useStudentExamResult,
  useGradeDescriptiveAnswer,
} from "../../hooks/useTeacher.js";
import type { StudentQuestionReviewDTO } from "../../lib/api/teacher.js";
import {
  PageHeader,
  Card,
  Button,
  Badge,
  LoadingState,
  EmptyState,
} from "../../components/ui/index.js";
import { formatPersianExamDate } from "../../utils/date.js";
import {
  User,
  ArrowRight,
  CheckCircle2,
  XCircle,
  MinusCircle,
  Clock,
  Award,
  HelpCircle,
  Check,
  AlertCircle,
  ClipboardPaste,
  Zap,
  Edit3,
  Activity,
  Info,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { toPersianDigits } from "@avana/domain";
import type { DescriptiveTimelineEvent } from "@avana/domain";

export function TeacherStudentResultDetailPage() {
  const { examId, studentId } = useParams<{ examId: string; studentId: string }>();

  const examQuery = useTeacherExam(examId);
  const studentResultQuery = useStudentExamResult(examId, studentId);

  const exam = examQuery.data?.exam;
  const resultData = studentResultQuery.data?.result ?? studentResultQuery.data?.detail;

  const isLoading = examQuery.isLoading || studentResultQuery.isLoading;

  if (isLoading) {
    return <LoadingState message="در حال بارگذاری کارنامه و پاسخ‌های دانش‌آموز..." />;
  }

  if (examQuery.isError || !exam) {
    return (
      <EmptyState
        title="آزمون یافت نشد"
        description="اطلاعات آزمون مورد نظر در دسترس نیست."
        action={
          <Link to="/teacher/classrooms">
            <Button variant="primary">بازگشت به کلاس‌ها</Button>
          </Link>
        }
      />
    );
  }

  if (studentResultQuery.isError || !resultData) {
    return (
      <EmptyState
        title="کارنامه دانش‌آموز یافت نشد"
        description="اطلاعات شرکت در آزمون برای این دانش‌آموز پیدا نشد."
        action={
          <Link to={`/teacher/exams/${examId}/results`}>
            <Button variant="primary">بازگشت به نتایج آزمون</Button>
          </Link>
        }
      />
    );
  }

  const { attempt, questions } = resultData;

  const formatDateTime = (isoString?: string | null) => {
    if (!isoString) return "—";
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return "—";
      const persianDate = formatPersianExamDate(d);
      const time = d.toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" });
      return `${persianDate} - ساعت ${time}`;
    } catch {
      return isoString;
    }
  };

  const getStatusBadge = () => {
    switch (attempt.status) {
      case "submitted":
        return <Badge variant="success">ثبت نهایی</Badge>;
      case "in_progress":
        return <Badge variant="warning">در حال آزمون</Badge>;
      case "timed_out":
        return <Badge variant="secondary">اتمام زمان</Badge>;
      case "absent":
        return <Badge variant="neutral" outlined className="text-slate-600 bg-slate-50 border-slate-300">غایب</Badge>;
      default:
        return <Badge variant="neutral" outlined>{attempt.status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
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
        <Link
          to={`/teacher/exams/${exam.id}`}
          className="hover:text-[#008080] transition-colors truncate max-w-[120px] sm:max-w-xs"
        >
          {exam.title}
        </Link>
        <span>/</span>
        <Link
          to={`/teacher/exams/${exam.id}/results`}
          className="hover:text-[#008080] transition-colors"
        >
          نتایج
        </Link>
        <span>/</span>
        <span className="text-[var(--color-text)] font-semibold truncate max-w-[120px] sm:max-w-xs">
          {attempt.studentName}
        </span>
      </div>

      {/* Page Header */}
      <PageHeader
        title={
          <div className="flex items-center gap-3 flex-wrap">
            <span>کارنامه انفرادی: {attempt.studentName}</span>
            {getStatusBadge()}
          </div>
        }
        description={`پاسخ‌نامه و نمرات تفصیلی آزمون «${exam.title}»`}
        actions={
          <Link to={`/teacher/exams/${exam.id}/results`}>
            <Button variant="outline" className="gap-2">
              <ArrowRight className="w-4 h-4" />
              بازگشت به نتایج آزمون
            </Button>
          </Link>
        }
      />

      {/* Attempt Summary Card */}
      <Card className="p-5 border border-[var(--color-border)] shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#008080]/10 text-[#008080] flex items-center justify-center font-bold text-lg shrink-0">
              <User className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--color-text)]">
                {attempt.studentName}
              </h3>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                {attempt.studentEmail}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {attempt.passed !== null && (
              <Badge
                variant={attempt.passed ? "success" : "error"}
                className="text-xs font-bold px-3 py-1.5"
              >
                {attempt.passed ? "قبول شده" : "مردود"}
              </Badge>
            )}
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 text-xs sm:text-sm">
          <div>
            <span className="text-[var(--color-text-muted)] block text-xs">نمره کسب‌شده:</span>
            <span className="font-bold text-base text-[var(--color-text)] mt-1 block">
              {attempt.score !== null && attempt.maxScore !== null
                ? `${attempt.score.toLocaleString("fa-IR")} از ${attempt.maxScore.toLocaleString("fa-IR")}`
                : "—"}
            </span>
          </div>

          <div>
            <span className="text-[var(--color-text-muted)] block text-xs">درصد نهایی:</span>
            <span className="font-bold text-base text-[var(--color-text)] mt-1 block">
              {attempt.percentage !== null
                ? `${attempt.percentage.toLocaleString("fa-IR")}٪`
                : "—"}
            </span>
          </div>

          <div>
            <span className="text-[var(--color-text-muted)] block text-xs">مدت زمان پاسخ‌گویی:</span>
            <span className="font-bold text-base text-[var(--color-text)] mt-1 block">
              {attempt.durationMinutes !== null
                ? `${attempt.durationMinutes.toLocaleString("fa-IR")} دقیقه`
                : "—"}
            </span>
          </div>

          <div>
            <span className="text-[var(--color-text-muted)] block text-xs">زمان ارسال پاسخ‌نامه:</span>
            <span className="font-medium text-xs text-[var(--color-text)] mt-1.5 block">
              {formatDateTime(attempt.submittedAt)}
            </span>
          </div>
        </div>
      </Card>

      {/* Absent State */}
      {attempt.status === "absent" && (
        <Card className="p-8 text-center border-dashed">
          <AlertCircle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
          <h4 className="text-base font-bold text-[var(--color-text)] mb-1">
            دانش‌آموز در آزمون شرکت نکرده است
          </h4>
          <p className="text-xs text-[var(--color-text-muted)]">
            هیچ پاسخ‌نامه‌ای برای این دانش‌آموز ثبت نشده و وضعیت آزمون غیبت محسوب می‌شود.
          </p>
        </Card>
      )}

      {/* Question by Question Review */}
      {attempt.status !== "absent" && (
        <div className="space-y-4">
          <h3 className="text-base sm:text-lg font-bold text-[var(--color-text)] flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-[#008080]" />
            بررسی سوالات و پاسخ‌های ارسالی ({questions.length} سوال)
          </h3>

          {questions.map((q, idx) => {
            const isDescriptive = q.questionType === "descriptive";
            const isCorrect = q.isCorrect === true;
            const isIncorrect = q.isCorrect === false;

            return (
              <Card key={q.questionId} className="p-5">
                {/* Header */}
                <div className="flex items-start justify-between gap-3 pb-3 border-b border-[var(--color-border)] mb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-[var(--color-surface-warm)] text-[var(--color-text)] text-xs font-bold flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    <span className="text-xs font-semibold text-[var(--color-text-muted)]">
                      سوال {idx + 1} {isDescriptive ? "(تشریحی)" : q.questionType === "true_false" ? "(صحیح / غلط)" : "(تستی)"}
                    </span>

                    {/* Correctness Badge */}
                    {isDescriptive ? (
                      q.gradingStatus === "ungraded" ? (
                        <Badge variant="warning" size="sm" className="gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          نیازمند تصحیح
                        </Badge>
                      ) : (q.pointsEarned ?? 0) === (q.maxPoints ?? 1) ? (
                        <Badge variant="success" size="sm" className="gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          نمره کامل
                        </Badge>
                      ) : (q.pointsEarned ?? 0) > 0 ? (
                        <Badge variant="secondary" size="sm">
                          نمره جزئی
                        </Badge>
                      ) : (
                        <Badge variant="error" size="sm" className="gap-1">
                          <XCircle className="w-3.5 h-3.5" />
                          نمره صفر
                        </Badge>
                      )
                    ) : q.questionType === "true_false" ? (
                      (q.pointsEarned ?? 0) === (q.maxPoints ?? 1) ? (
                        <Badge variant="success" className="gap-1 text-xs">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          صحیح
                        </Badge>
                      ) : (q.pointsEarned ?? 0) > 0 ? (
                        <Badge variant="secondary" className="gap-1 text-xs">
                          نمره جزئی ({toPersianDigits(q.pointsEarned ?? 0)} از {toPersianDigits(q.maxPoints ?? 1)})
                        </Badge>
                      ) : q.statements?.some((s) => typeof s.selectedAnswer === "boolean") ? (
                        <Badge variant="error" className="gap-1 text-xs">
                          <XCircle className="w-3.5 h-3.5" />
                          نادرست
                        </Badge>
                      ) : (
                        <Badge variant="warning" outlined className="gap-1 text-xs text-amber-700 bg-amber-50 border-amber-200">
                          <MinusCircle className="w-3.5 h-3.5" />
                          بدون پاسخ
                        </Badge>
                      )
                    ) : isCorrect ? (
                      <Badge variant="success" className="gap-1 text-xs">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        صحیح
                      </Badge>
                    ) : isIncorrect ? (
                      <Badge variant="error" className="gap-1 text-xs">
                        <XCircle className="w-3.5 h-3.5" />
                        نادرست
                      </Badge>
                    ) : (
                      <Badge variant="warning" outlined className="gap-1 text-xs text-amber-700 bg-amber-50 border-amber-200">
                        <MinusCircle className="w-3.5 h-3.5" />
                        بدون پاسخ
                      </Badge>
                    )}
                  </div>

                  <div className="text-xs font-bold text-[var(--color-text)]">
                    بارم: {toPersianDigits(q.pointsEarned ?? 0)} از {toPersianDigits(q.maxPoints ?? 1)} نمره
                  </div>
                </div>

                {/* Prompt */}
                <p className="text-sm sm:text-base font-semibold text-[var(--color-text)] leading-relaxed whitespace-pre-wrap mb-4">
                  {q.prompt}
                </p>

                {/* Question Content */}
                {isDescriptive ? (
                  <DescriptiveQuestionGradeSection
                    examId={examId!}
                    attemptId={attempt.attemptId ?? attempt.id ?? ""}
                    studentId={studentId!}
                    question={q}
                  />
                ) : q.questionType === "true_false" ? (
                  <div className="space-y-2.5">
                    {(q.statements ?? []).map((stmt, sIdx) => {
                      const hasAnswer = typeof stmt.selectedAnswer === "boolean";
                      const isStmtCorrect = stmt.isCorrect;
                      return (
                        <div
                          key={stmt.id}
                          className={`p-3.5 rounded-xl border space-y-2 ${
                            isStmtCorrect
                              ? "border-emerald-500/50 bg-emerald-50/40 text-emerald-950"
                              : hasAnswer
                              ? "border-rose-400/60 bg-rose-50/40 text-rose-950"
                              : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-2.5 flex-1">
                              <span className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold bg-[var(--color-surface)] border border-[var(--color-border)]">
                                {toPersianDigits(sIdx + 1)}
                              </span>
                              <span className="text-xs sm:text-sm font-medium leading-relaxed">{stmt.text}</span>
                            </div>
                            <Badge
                              variant={isStmtCorrect ? "success" : hasAnswer ? "error" : "neutral"}
                              size="sm"
                              className="gap-1 text-xs"
                            >
                              {isStmtCorrect ? (
                                <>
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  درست
                                </>
                              ) : hasAnswer ? (
                                <>
                                  <XCircle className="w-3.5 h-3.5" />
                                  نادرست
                                </>
                              ) : (
                                <>
                                  <MinusCircle className="w-3.5 h-3.5" />
                                  بدون پاسخ
                                </>
                              )}
                            </Badge>
                          </div>

                          <div className="flex items-center gap-4 text-xs font-semibold pt-1 border-t border-[var(--color-border)]/50">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[var(--color-text-muted)] font-normal">پاسخ دانش‌آموز:</span>
                              <span
                                className={
                                  hasAnswer
                                    ? stmt.selectedAnswer ? "text-emerald-700 font-bold" : "text-rose-700 font-bold"
                                    : "text-[var(--color-text-muted)] italic font-normal"
                                }
                              >
                                {hasAnswer ? (stmt.selectedAnswer ? "صحیح" : "غلط") : "بدون پاسخ"}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[var(--color-text-muted)] font-normal">کلید صحیح:</span>
                              <span className={stmt.correctAnswer ? "text-emerald-700 font-bold" : "text-rose-700 font-bold"}>
                                {stmt.correctAnswer ? "صحیح" : "غلط"}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* Options List */
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {(q.options ?? []).map((opt) => {
                      const isSelected = opt.id === q.selectedOptionId;
                      const isKey = opt.id === q.correctOptionId;

                      let containerClass =
                        "bg-[var(--color-surface-warm)]/40 border-[var(--color-border)] text-[var(--color-text)]";
                      let badgeNode = null;

                      if (isSelected && isKey) {
                        // Student chose correct answer
                        containerClass =
                          "bg-emerald-500/10 border-emerald-500/40 text-emerald-900 font-medium";
                        badgeNode = (
                          <div className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 shrink-0">
                            <Check className="w-3.5 h-3.5" />
                            <span>پاسخ صحیح دانش‌آموز</span>
                          </div>
                        );
                      } else if (isSelected && !isKey) {
                        // Student chose wrong answer
                        containerClass =
                          "bg-rose-500/10 border-rose-500/40 text-rose-900 font-medium";
                        badgeNode = (
                          <div className="flex items-center gap-1 text-[11px] font-bold text-rose-700 shrink-0">
                            <XCircle className="w-3.5 h-3.5" />
                            <span>انتخاب نادرست دانش‌آموز</span>
                          </div>
                        );
                      } else if (!isSelected && isKey) {
                        // Correct answer key that student missed
                        containerClass =
                          "bg-[#008080]/5 border-[#008080]/30 text-[#008080] font-medium";
                        badgeNode = (
                          <div className="flex items-center gap-1 text-[11px] font-bold text-[#008080] shrink-0">
                            <Check className="w-3.5 h-3.5" />
                            <span>پاسخ صحیح کلید</span>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={opt.id}
                          className={`p-3 rounded-xl border text-xs sm:text-sm flex items-center justify-between gap-2 transition-colors ${containerClass}`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <span
                              className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                                isSelected && isKey
                                  ? "bg-emerald-600 text-white"
                                  : isSelected && !isKey
                                    ? "bg-rose-600 text-white"
                                    : isKey
                                      ? "bg-[#008080] text-white"
                                      : "bg-[var(--color-border)] text-[var(--color-text-muted)]"
                              }`}
                            >
                              {opt.id.replace("opt_", "")}
                            </span>
                            <span className="truncate">{opt.text}</span>
                          </div>
                          {badgeNode}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Explanation */}
                {q.explanation && (
                  <div className="mt-4 p-3 rounded-xl bg-[var(--color-surface-warm)]/60 border border-[var(--color-border)] text-xs text-[var(--color-text)] leading-relaxed">
                    <span className="font-bold text-[#008080] block mb-1">
                      راهنمای پاسخ تشریحی:
                    </span>
                    <span>{q.explanation}</span>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatDuration(ms?: number | null): string {
  if (ms === null || ms === undefined || ms < 0) return "—";
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) {
    return `${toPersianDigits(totalSeconds)} ثانیه`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  if (remainingSeconds === 0) {
    return `${toPersianDigits(minutes)} دقیقه`;
  }
  return `${toPersianDigits(minutes)} دقیقه و ${toPersianDigits(remainingSeconds)} ثانیه`;
}

function getTimelineEventDetails(event: DescriptiveTimelineEvent) {
  switch (event.type) {
    case "start":
      return { label: "شروع نگارش پاسخ", icon: Clock, color: "text-blue-700 bg-blue-50 border-blue-200" };
    case "typing":
      return { label: "تایپ تدریجی متن", icon: Edit3, color: "text-slate-700 bg-slate-50 border-slate-200" };
    case "paste":
      return { label: "عملیات Paste", icon: ClipboardPaste, color: "text-amber-700 bg-amber-50 border-amber-200" };
    case "rapid_input":
      return { label: "ورود سریع متن (Rapid Input)", icon: Zap, color: "text-rose-700 bg-rose-50 border-rose-200" };
    case "edit":
      return { label: "ویرایش یا حذف متن", icon: Edit3, color: "text-indigo-700 bg-indigo-50 border-indigo-200" };
    case "submit":
      return { label: "ثبت نهایی / ذخیره", icon: CheckCircle2, color: "text-emerald-700 bg-emerald-50 border-emerald-200" };
    default:
      return { label: "رویداد", icon: Activity, color: "text-slate-700 bg-slate-50 border-slate-200" };
  }
}

function DescriptiveAnswerIntegrityCard({
  analysis,
}: {
  analysis?: StudentQuestionReviewDTO["integrityAnalysis"];
}) {
  const [showTimeline, setShowTimeline] = useState(false);

  if (!analysis) {
    return null;
  }

  const pasteRatioPercent = Math.round((analysis.pasteRatio ?? 0) * 100);
  const hasTimeline = Array.isArray(analysis.timeline) && analysis.timeline.length > 0;

  return (
    <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200 space-y-3.5 text-xs text-[var(--color-text)]">
      {/* Title & Top Badges */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-2.5">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-[#008080]" />
          <span className="font-bold text-sm text-[var(--color-text)]">
            اطلاعات ثبت و رفتار ورود پاسخ:
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {analysis.largePasteDetected && (
            <Badge variant="warning" size="sm" className="gap-1 font-bold">
              <ClipboardPaste className="w-3.5 h-3.5" />
              Paste با حجم بزرگ
            </Badge>
          )}

          {analysis.rapidInputDetected && (
            <Badge variant="secondary" size="sm" className="gap-1 font-bold">
              <Zap className="w-3.5 h-3.5" />
              ورود سریع متن
            </Badge>
          )}

          {analysis.reviewRecommended && (
            <Badge variant="warning" size="sm" className="gap-1 bg-amber-100 text-amber-900 border-amber-300 font-bold">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              نیازمند بررسی تکمیلی
            </Badge>
          )}
        </div>
      </div>

      {/* Review Recommended Notice */}
      {analysis.reviewRecommended && (
        <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-2 text-amber-900 text-xs">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <strong className="font-bold">پیشنهاد بررسی توسط استاد:</strong> بر اساس حجم یا سرعت ورود متن، این پاسخ ممکن است نیازمند ارزیابی دقیق‌تر محتوایی باشد.
          </p>
        </div>
      )}

      {/* Telemetry Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="p-2.5 rounded-lg bg-white border border-slate-200/70">
          <span className="text-[var(--color-text-muted)] block text-[11px]">زمان پاسخ‌گویی:</span>
          <span className="font-bold text-xs text-[var(--color-text)] mt-1 block">
            {formatDuration(analysis.durationMs)}
          </span>
        </div>

        <div className="p-2.5 rounded-lg bg-white border border-slate-200/70">
          <span className="text-[var(--color-text-muted)] block text-[11px]">عملیات Paste:</span>
          <span className="font-bold text-xs text-[var(--color-text)] mt-1 block">
            {toPersianDigits(analysis.pasteCount)} بار
            {analysis.pasteCount > 0 && (
              <span className="text-[10px] text-[var(--color-text-muted)] font-normal mr-1">
                ({toPersianDigits(analysis.pastedCharactersTotal)} کاراکتر / {toPersianDigits(analysis.pastedWordsTotal)} کلمه)
              </span>
            )}
          </span>
        </div>

        <div className="p-2.5 rounded-lg bg-white border border-slate-200/70">
          <span className="text-[var(--color-text-muted)] block text-[11px]">نسبت Paste به کل متن:</span>
          <span className="font-bold text-xs text-[var(--color-text)] mt-1 block">
            {toPersianDigits(pasteRatioPercent)}٪
          </span>
        </div>

        <div className="p-2.5 rounded-lg bg-white border border-slate-200/70">
          <span className="text-[var(--color-text-muted)] block text-[11px]">دفعات ویرایش / اصلاح:</span>
          <span className="font-bold text-xs text-[var(--color-text)] mt-1 block">
            {toPersianDigits(analysis.editCount)} بار
          </span>
        </div>
      </div>

      {/* Signals List */}
      {analysis.signals && analysis.signals.length > 0 && (
        <div className="p-2.5 rounded-lg bg-white border border-slate-200/70 space-y-1">
          <span className="font-bold text-[11px] text-[var(--color-text-muted)] block mb-1">
            سیگنال‌های رفتاری ثبت‌شده:
          </span>
          <ul className="list-disc list-inside space-y-0.5 text-xs text-slate-700">
            {analysis.signals.map((sig, idx) => (
              <li key={idx} className="leading-relaxed">
                {sig}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Collapsible Timeline */}
      {hasTimeline && (
        <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
          <button
            type="button"
            onClick={() => setShowTimeline(!showTimeline)}
            className="w-full px-3 py-2 text-right flex items-center justify-between text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-[#008080]" />
              <span>تایم‌لاین رویدادهای نگارش ({toPersianDigits(analysis.timeline.length)} رویداد)</span>
            </div>
            {showTimeline ? (
              <ChevronUp className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            )}
          </button>

          {showTimeline && (
            <div className="p-3 border-t border-slate-200 space-y-2 max-h-60 overflow-y-auto">
              {analysis.timeline.map((event, idx) => {
                const details = getTimelineEventDetails(event);
                const IconComponent = details.icon;
                const timeStr = event.timestamp
                  ? new Date(event.timestamp).toLocaleTimeString("fa-IR", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })
                  : "—";

                return (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2 rounded-lg border border-slate-100 bg-slate-50/50 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`p-1 rounded-md border ${details.color} shrink-0`}>
                        <IconComponent className="w-3.5 h-3.5" />
                      </span>
                      <span className="font-semibold text-slate-800">{details.label}</span>
                      {event.characterDelta !== undefined && event.characterDelta !== null && event.characterDelta !== 0 && (
                        <span className="text-[10px] text-slate-500 font-medium">
                          ({event.characterDelta > 0 ? "+" : ""}{toPersianDigits(event.characterDelta)} کاراکتر)
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-400 font-mono" dir="ltr">
                      {timeStr}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Non-accusatory Disclaimer */}
      <div className="flex items-start gap-1.5 p-2 rounded-lg bg-slate-100/70 text-[11px] text-slate-600 leading-relaxed">
        <Info className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
        <span>
          <strong className="font-semibold">توجه استاد:</strong> این اطلاعات صرفاً گزارش عینی از نحوه و ریتم نگارش پاسخ است و به تنهایی بیانگر تقلب یا استفاده از هوش مصنوعی نیست.
        </span>
      </div>
    </div>
  );
}

function DescriptiveQuestionGradeSection({
  examId,
  attemptId,
  studentId,
  question,
}: {
  examId: string;
  attemptId: string;
  studentId: string;
  question: StudentQuestionReviewDTO;
}) {
  const [points, setPoints] = useState<string>(
    question.pointsEarned !== null && question.pointsEarned !== undefined
      ? String(question.pointsEarned)
      : ""
  );
  const [feedback, setFeedback] = useState<string>(question.teacherFeedback ?? "");
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setPoints(
      question.pointsEarned !== null && question.pointsEarned !== undefined
        ? String(question.pointsEarned)
        : ""
    );
    setFeedback(question.teacherFeedback ?? "");
  }, [question.pointsEarned, question.teacherFeedback]);

  const gradeMutation = useGradeDescriptiveAnswer(examId, studentId);
  const maxPoints = question.maxPoints ?? 1;

  const handleSaveGrade = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMessage(null);
    setErrorMessage(null);

    if (!attemptId || attemptId.trim().length === 0) {
      setErrorMessage("شناسه تلاش آزمون یافت نشد.");
      return;
    }

    const standardPointsStr = points
      .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
      .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
      .replace(/[/،]/g, ".");

    const parsedPoints = parseFloat(standardPointsStr);
    if (isNaN(parsedPoints) || !Number.isFinite(parsedPoints) || parsedPoints < 0) {
      setErrorMessage("نمره داده‌شده باید عددی مثبت یا صفر باشد.");
      return;
    }

    if (parsedPoints > maxPoints + 1e-9) {
      setErrorMessage(`نمره داده‌شده نمی‌تواند بیشتر از بارم سؤال (${maxPoints}) باشد.`);
      return;
    }

    if (Math.abs(parsedPoints * 100 - Math.round(parsedPoints * 100)) > 1e-6) {
      setErrorMessage("نمره داده‌شده حداکثر می‌تواند ۲ رقم اعشار داشته باشد.");
      return;
    }

    const normalizedPoints = Math.round(parsedPoints * 100) / 100;
    if (normalizedPoints > maxPoints) {
      setErrorMessage(`نمره داده‌شده نمی‌تواند بیشتر از بارم سؤال (${maxPoints}) باشد.`);
      return;
    }

    try {
      await gradeMutation.mutateAsync({
        attemptId,
        questionId: question.questionId,
        input: {
          pointsEarned: normalizedPoints,
          teacherFeedback: feedback.trim().length > 0 ? feedback.trim() : null,
        },
      });
      setSuccessMessage("نمره با موفقیت ثبت شد.");
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch {
      // Error handled by mutation
    }
  };

  const isGraded = question.gradingStatus === "graded";

  return (
    <div className="space-y-3 pt-2">
      {/* Student's Written Answer */}
      <div className="p-4 rounded-xl bg-[var(--color-bg-default)] border border-[var(--color-border)] space-y-1.5">
        <span className="text-xs font-bold text-[var(--color-text-muted)] block">
          پاسخ تشریحی ارسالی دانش‌آموز:
        </span>
        {question.textAnswer && question.textAnswer.trim().length > 0 ? (
          <p className="text-sm text-[var(--color-text)] whitespace-pre-wrap leading-relaxed">
            {question.textAnswer}
          </p>
        ) : (
          <span className="text-xs text-[var(--color-text-muted)] italic">
            دانش‌آموز به این سوال پاسخ متنی نداده است (بدون پاسخ).
          </span>
        )}
      </div>

      {/* Answer Integrity & Behavioral Telemetry Card */}
      <DescriptiveAnswerIntegrityCard analysis={question.integrityAnalysis} />

      {/* Teacher Grading Box */}
      <form
        onSubmit={handleSaveGrade}
        className="p-4 rounded-xl bg-[var(--color-surface-warm)]/50 border border-[var(--color-border)] space-y-3"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-[var(--color-text)] flex items-center gap-1.5">
            <Award className="w-4 h-4 text-[#008080]" />
            تصحیح و ثبت نمره استاد:
          </span>
          {isGraded ? (
            <Badge variant="success" size="sm">
              تصحیح شده ({toPersianDigits(question.pointsEarned ?? 0)} از {toPersianDigits(maxPoints)})
            </Badge>
          ) : (
            <Badge variant="warning" size="sm">
              نیازمند تصحیح
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-1">
            <label className="text-xs font-semibold text-[var(--color-text-muted)] block mb-1">
              نمره اختصاصی (سقف: {toPersianDigits(maxPoints)}):
            </label>
            <input
              type="number"
              min={0}
              max={maxPoints}
              step="0.01"
              required
              value={points}
              onChange={(e) => setPoints(e.target.value)}
              placeholder={`0 تا ${maxPoints}`}
              className="w-full px-3 py-2 text-sm rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[#008080]"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="text-xs font-semibold text-[var(--color-text-muted)] block mb-1">
              بازخورد و یادداشت به دانش‌آموز (اختیاری):
            </label>
            <input
              type="text"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="مثال: استدلال در بخش دوم کامل نبود..."
              className="w-full px-3 py-2 text-sm rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[#008080]"
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-1">
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={!attemptId || gradeMutation.isPending || points === ""}
            className="text-xs px-4"
          >
            {gradeMutation.isPending
              ? "در حال ثبت..."
              : isGraded
              ? "بروزرسانی نمره"
              : "ثبت نمره"}
          </Button>

          {successMessage && (
            <span className="text-xs text-emerald-600 font-medium">
              {successMessage}
            </span>
          )}
          {errorMessage && (
            <span className="text-xs text-red-600 font-medium">
              {errorMessage}
            </span>
          )}
          {gradeMutation.isError && !errorMessage && (
            <span className="text-xs text-red-600 font-medium">
              خطا در ثبت نمره. لطفاً دوباره تلاش کنید.
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
