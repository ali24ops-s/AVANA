/**
 * StudentExamResultsView.
 *
 * Renders student exam results and question-by-question review:
 *  - When resultsReleased is false: Displays friendly submitted confirmation and
 *    server message; STRICTLY hides questions, answers, and keys.
 *  - When resultsReleased is true: Displays score overview, percentage, pass status,
 *    and detailed breakdown with selected answers, correct answers, and explanations.
 */

import React from "react";
import { Link } from "react-router-dom";
import {
  Card,
  Badge,
  Button,
  Alert,
} from "../ui/index.js";
import { type StudentReviewDTO } from "../../lib/api/student-platform.js";
import { formatPersianExamDate } from "../../utils/date.js";
import { toPersianDigits } from "@avana/domain";
import { RichContent } from "../markdown/MarkdownRenderer.js";
import {
  Award,
  CheckCircle2,
  XCircle,
  Clock,
  HelpCircle,
  Lightbulb,
  Check,
  X,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
} from "lucide-react";

export interface StudentExamResultsViewProps {
  examTitle: string;
  classroomId: string;
  review: StudentReviewDTO;
}

const OPTION_LABELS = ["الف", "ب", "ج", "د", "هـ", "و"];

export function StudentExamResultsView({
  examTitle,
  classroomId,
  review,
}: StudentExamResultsViewProps) {
  const isReleased = review.resultsReleased;
  const isPassed = Boolean(review.passed);

  return (
    <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 font-sans" dir="rtl">
      {/* Breadcrumb Navigation */}
      <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)] mb-6">
        <Link to="/classrooms" className="hover:text-[#008080] transition-colors">
          کلاس‌های من
        </Link>
        <span>/</span>
        <Link
          to={`/classrooms/${classroomId}`}
          className="hover:text-[#008080] transition-colors"
        >
          کلاس
        </Link>
        <span>/</span>
        <span className="text-[var(--color-text)] font-semibold">{examTitle}</span>
      </div>

      {/* --------------------------------------------------------------------- */}
      {/* Scenario A: Results NOT Released Yet */}
      {/* --------------------------------------------------------------------- */}
      {/* --------------------------------------------------------------------- */}
      {/* Scenario A: Results NOT Released Yet */}
      {/* --------------------------------------------------------------------- */}
      {!isReleased ? (
        <Card className="p-8 sm:p-12 text-center border border-[var(--color-border)] rounded-3xl bg-[var(--color-surface)] shadow-xs space-y-6">
          {review.state === "grading_in_progress" ? (
            <div className="w-16 h-16 rounded-3xl bg-amber-500/10 text-amber-600 flex items-center justify-center mx-auto">
              <Clock className="w-9 h-9" />
            </div>
          ) : (
            <div className="w-16 h-16 rounded-3xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-9 h-9" />
            </div>
          )}

          <div>
            <Badge
              variant={
                review.state === "grading_in_progress"
                  ? "warning"
                  : review.state === "results_unpublished_closed"
                  ? "neutral"
                  : "success"
              }
              size="md"
              className="mb-3"
            >
              {review.state === "grading_in_progress"
                ? "در حال آماده‌سازی و تصحیح"
                : review.state === "results_unpublished_closed"
                ? "پایان مهلت آزمون"
                : review.status === "submitted"
                ? "پاسخ‌ها با موفقیت ثبت شد"
                : "پایان مهلت آزمون"}
            </Badge>
            <h1 className="text-xl sm:text-2xl font-bold text-[var(--color-text)]">
              {review.state === "grading_in_progress"
                ? "نتیجه آزمون در حال آماده‌سازی است"
                : review.state === "results_unpublished_closed"
                ? "نتیجه آزمون هنوز منتشر نشده است"
                : `نتیجه آزمون «${examTitle}»`}
            </h1>
            {review.submittedAt && (
              <p className="text-xs text-[var(--color-text-muted)] mt-2 flex items-center justify-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                <span>زمان ثبت: {formatPersianExamDate(review.submittedAt)}</span>
              </p>
            )}
          </div>

          <div className="max-w-md mx-auto p-4 rounded-2xl bg-[var(--color-bg-default)] border border-[var(--color-border)] text-xs sm:text-sm text-[var(--color-text-muted)] leading-relaxed">
            <ShieldCheck className="w-5 h-5 text-[#008080] mx-auto mb-2" />
            <p>
              {review.message ||
                (review.state === "grading_in_progress"
                  ? "نتیجه آزمون در حال آماده‌سازی است. لطفاً بعداً دوباره تلاش کنید."
                  : review.state === "results_unpublished_closed"
                  ? "آزمون به پایان رسیده است، اما نتیجه آن هنوز منتشر نشده است."
                  : review.state === "results_pending_teacher"
                  ? "نتیجه آزمون هنوز توسط استاد اعلام نشده است."
                  : "نتایج این آزمون پس از پایان مهلت آزمون یا انتشار توسط استاد در دسترس خواهد بود.")}
            </p>
          </div>

          <div className="pt-4 flex justify-center">
            <Link to={`/classrooms/${classroomId}`}>
              <Button variant="primary" size="md">
                <ArrowRight className="w-4 h-4 ml-1" />
                بازگشت به کلاس
              </Button>
            </Link>
          </div>
        </Card>
      ) : (
        /* --------------------------------------------------------------------- */
        /* Scenario B: Results Released */
        /* --------------------------------------------------------------------- */
        <div className="space-y-6">
          {/* Hero Score Overview */}
          <Card className="p-6 sm:p-8 border border-[var(--color-border)] rounded-3xl bg-[var(--color-surface)] shadow-xs">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                <div
                  className={`w-16 h-16 rounded-3xl flex items-center justify-center shrink-0 ${
                    isPassed
                      ? "bg-emerald-500/10 text-emerald-600"
                      : "bg-amber-500/10 text-amber-600"
                  }`}
                >
                  <Award className="w-8 h-8" />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant={isPassed ? "success" : "warning"} size="sm">
                      {isPassed ? "قبول" : "نیاز به تلاش مجدد"}
                    </Badge>
                    <span className="text-xs text-[var(--color-text-muted)]">
                      {review.status === "submitted" ? "ثبت نهایی شده" : "پایان زمان"}
                    </span>
                  </div>
                  <h1 className="text-xl sm:text-2xl font-bold text-[var(--color-text)]">
                    کارنامه آزمون «{examTitle}»
                  </h1>
                </div>
              </div>

              {/* Score Metric Badges */}
              <div className="flex items-center gap-4 bg-[var(--color-bg-default)] p-4 rounded-2xl border border-[var(--color-border)]">
                <div className="text-center px-3">
                  <span className="text-xs text-[var(--color-text-muted)] block">نمره نهایی</span>
                  <span className="text-xl sm:text-2xl font-bold text-[var(--color-text)]">
                    {toPersianDigits(review.score ?? 0)}{" "}
                    <span className="text-xs font-normal text-[var(--color-text-muted)]">
                      / {toPersianDigits(review.maxScore ?? 0)}
                    </span>
                  </span>
                </div>
                <div className="w-px h-10 bg-[var(--color-border)]" />
                <div className="text-center px-3">
                  <span className="text-xs text-[var(--color-text-muted)] block">درصد کسب‌شده</span>
                  <span className="text-xl sm:text-2xl font-bold text-[#008080]">
                    {toPersianDigits(review.percentage ?? 0)}٪
                  </span>
                </div>
              </div>
            </div>
          </Card>

          {/* Questions Review Section */}
          <div className="space-y-4">
            <h2 className="text-base font-bold text-[var(--color-text)] flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-[#008080]" />
              بررسی سؤالات و پاسخ‌ها
            </h2>

            {review.questions?.map((q, idx) => {
              const isDescriptive = q.questionType === "descriptive";
              const isCorrect = q.isCorrect;
              const hasAnswered = isDescriptive
                ? Boolean(q.textAnswer && q.textAnswer.trim().length > 0)
                : q.selectedOptionId !== null;

              return (
                <Card
                  key={q.questionId}
                  className="p-6 border border-[var(--color-border)] rounded-2xl bg-[var(--color-surface)] space-y-4"
                >
                  {/* Question Header */}
                  <div className="flex items-center justify-between gap-3 pb-3 border-b border-[var(--color-border)]">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-[var(--color-text)] bg-neutral-100 px-2.5 py-1 rounded-lg">
                        سؤال {toPersianDigits(idx + 1)} {q.questionType === "true_false" ? "(صحیح / غلط)" : isDescriptive ? "(تشریحی)" : "(تستی)"}
                      </span>
                      {isDescriptive ? (
                        q.gradingStatus === "ungraded" ? (
                          <Badge variant="warning" size="sm" icon={<Clock className="w-3 h-3" />}>
                            در انتظار تصحیح استاد
                          </Badge>
                        ) : (q.pointsEarned ?? 0) === (q.maxPoints ?? 1) ? (
                          <Badge variant="success" size="sm" icon={<Check className="w-3 h-3" />}>
                            نمره کامل
                          </Badge>
                        ) : (q.pointsEarned ?? 0) > 0 ? (
                          <Badge variant="secondary" size="sm">
                            نمره جزئی
                          </Badge>
                        ) : (
                          <Badge variant="error" size="sm" icon={<X className="w-3 h-3" />}>
                            نمره صفر
                          </Badge>
                        )
                      ) : isCorrect ? (
                        <Badge variant="success" size="sm" icon={<Check className="w-3 h-3" />}>
                          پاسخ صحیح
                        </Badge>
                      ) : hasAnswered ? (
                        <Badge variant="error" size="sm" icon={<X className="w-3 h-3" />}>
                          پاسخ نادرست
                        </Badge>
                      ) : (
                        <Badge variant="neutral" size="sm">
                          بدون پاسخ
                        </Badge>
                      )}
                    </div>

                    <span className="text-xs text-[var(--color-text-muted)] font-medium">
                      نمره: {toPersianDigits(q.pointsEarned ?? 0)} از {toPersianDigits(q.maxPoints ?? 1)}
                    </span>
                  </div>

                  {/* Question Prompt */}
                  <div className="text-sm sm:text-base font-medium text-[var(--color-text)] leading-relaxed">
                    <RichContent content={q.prompt} />
                  </div>

                  {/* Question Content / Answer */}
                  {isDescriptive ? (
                    <div className="space-y-3 pt-1">
                      <div className="p-4 rounded-xl bg-[var(--color-bg-default)] border border-[var(--color-border)] space-y-1.5">
                        <span className="text-xs font-bold text-[var(--color-text-muted)] block">
                          پاسخ تشریحی شما:
                        </span>
                        {q.textAnswer && q.textAnswer.trim().length > 0 ? (
                          <p className="text-sm text-[var(--color-text)] whitespace-pre-wrap leading-relaxed">
                            {q.textAnswer}
                          </p>
                        ) : (
                          <span className="text-xs text-[var(--color-text-muted)] italic">
                            بدون پاسخ ثبت‌شده
                          </span>
                        )}
                      </div>

                      {q.teacherFeedback && (
                        <div className="p-4 rounded-xl bg-teal-500/10 border border-teal-500/20 space-y-1 text-xs sm:text-sm">
                          <div className="flex items-center gap-1.5 font-bold text-[#008080]">
                            <CheckCircle2 className="w-4 h-4" />
                            <span>بازخورد استاد:</span>
                          </div>
                          <p className="text-[var(--color-text)] leading-relaxed mr-5 whitespace-pre-wrap">
                            {q.teacherFeedback}
                          </p>
                        </div>
                      )}
                    </div>
                  ) : q.questionType === "true_false" ? (
                    <div className="space-y-2.5 pt-1">
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
                                icon={isStmtCorrect ? <Check className="w-3 h-3" /> : hasAnswer ? <X className="w-3 h-3" /> : undefined}
                              >
                                {isStmtCorrect ? "درست" : hasAnswer ? "نادرست" : "بدون پاسخ"}
                              </Badge>
                            </div>

                            <div className="flex items-center gap-4 text-xs font-semibold pt-1 border-t border-[var(--color-border)]/50">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[var(--color-text-muted)] font-normal">پاسخ شما:</span>
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
                    <div className="space-y-2.5 pt-1">
                      {(q.options ?? []).map((opt, optIdx) => {
                        const isSelected = opt.id === q.selectedOptionId;
                        const isCorrectOption = opt.id === q.correctOptionId;
                        const optionLetter = OPTION_LABELS[optIdx] ?? String(optIdx + 1);

                        let style = "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]";
                        let badgeText: string | null = null;

                        if (isCorrectOption) {
                          style = "border-emerald-500 bg-emerald-50/60 text-emerald-950 font-medium";
                          badgeText = "گزینه صحیح";
                        } else if (isSelected && !isCorrect) {
                          style = "border-red-400 bg-red-50/60 text-red-950 font-medium";
                          badgeText = "پاسخ شما";
                        }

                        return (
                          <div
                            key={opt.id}
                            className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 text-xs sm:text-sm ${style}`}
                          >
                            <div className="flex items-center gap-3">
                              <span
                                className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                                  isCorrectOption
                                    ? "bg-emerald-600 text-white"
                                    : isSelected
                                    ? "bg-red-600 text-white"
                                    : "bg-neutral-100 text-neutral-600"
                                }`}
                              >
                                {optionLetter}
                              </span>
                              <span>{opt.text}</span>
                            </div>

                            {badgeText && (
                              <span
                                className={`text-[11px] font-bold px-2 py-0.5 rounded-md shrink-0 ${
                                  isCorrectOption
                                    ? "bg-emerald-600 text-white"
                                    : "bg-red-600 text-white"
                                }`}
                              >
                                {badgeText}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Explanation if released */}
                  {q.explanation && (
                    <div className="mt-3 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs sm:text-sm text-[var(--color-text)] space-y-1">
                      <div className="flex items-center gap-1.5 font-bold text-amber-700">
                        <Lightbulb className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>توضیح پاسخ:</span>
                      </div>
                      <div className="text-[var(--color-text-muted)] leading-relaxed mr-5">
                        <RichContent content={q.explanation} />
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>

          {/* Bottom Action */}
          <div className="pt-4 flex justify-between items-center">
            <Link to={`/classrooms/${classroomId}`}>
              <Button variant="outline" size="md">
                بازگشت به کلاس
              </Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
