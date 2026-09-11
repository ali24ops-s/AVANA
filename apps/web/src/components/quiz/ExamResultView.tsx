import { useMemo, useState } from "react";
import { TrophyIcon, RefreshIcon } from "./ExamIcons.js";
import { RichContent } from "../markdown/MarkdownRenderer.js";
import { Button, Card, Badge } from "@avana/ui";
import {
  evaluateQuestionAnswer,
  type QuestionEvaluationResult,
  toPersianDigits,
  formatPersianOf,
} from "@avana/domain";

export interface QuestionResultItem {
  status: "correct" | "incorrect" | "unanswered" | "partial";
  scoreRatio: number;
  selectedValues: string[];
  correctValues: string[];
}

export interface ExamResultViewProps {
  result: {
    attemptId?: string;
    score: number;
    correct: number;
    incorrect?: number;
    unanswered?: number;
    partial?: number;
    total: number;
    passed?: boolean;
    completedAt?: string | null;
    answers?: Record<string, unknown>;
    questionResults?: Record<string, QuestionResultItem>;
    questions?: Array<{
      id: string;
      question: string;
      choices: string[] | null;
      correctAnswer?: unknown;
      explanation?: string | null;
      topic?: string | null;
      difficulty?: string | null;
      questionType?: string;
    }>;
  };
  onRetry: () => void;
  onReturnToConfig: () => void;
}

export function ExamResultView({
  result,
  onRetry,
  onReturnToConfig,
}: ExamResultViewProps) {
  const scorePct = Math.round(result.score);
  const isPassing = scorePct >= 60;
  const questions = result.questions || [];

  const [activeFilter, setActiveFilter] = useState<"all" | "review_needed">("all");

  // Calculate canonical evaluations per question
  const evaluations = useMemo(() => {
    const map: Record<string, QuestionEvaluationResult> = {};
    for (const q of questions) {
      if (result.questionResults && result.questionResults[q.id]) {
        map[q.id] = result.questionResults[q.id];
      } else {
        const userAns = result.answers?.[q.id];
        map[q.id] = evaluateQuestionAnswer(userAns, {
          choices: q.choices,
          correctAnswer: q.correctAnswer,
          questionType: q.questionType,
        });
      }
    }
    return map;
  }, [questions, result.questionResults, result.answers]);

  // Aggregate metrics
  const { correctCount, incorrectCount, unansweredCount, partialCount } = useMemo(() => {
    let c = 0;
    let i = 0;
    let u = 0;
    let p = 0;

    for (const q of questions) {
      const ev = evaluations[q.id];
      if (ev) {
        if (ev.status === "correct") c++;
        else if (ev.status === "partial") p++;
        else if (ev.status === "unanswered") u++;
        else i++;
      }
    }

    return {
      correctCount: result.correct ?? c,
      incorrectCount: result.incorrect ?? i,
      unansweredCount: result.unanswered ?? u,
      partialCount: result.partial ?? p,
    };
  }, [questions, evaluations, result.correct, result.incorrect, result.unanswered, result.partial]);

  // Topic mastery performance breakdown
  const topicBreakdown = useMemo(() => {
    const map = new Map<string, { total: number; earned: number; correct: number }>();
    for (const q of questions) {
      const topic = q.topic?.trim() || "مباحث جامع";
      const ev = evaluations[q.id];
      const curr = map.get(topic) || { total: 0, earned: 0, correct: 0 };
      curr.total += 1;
      if (ev) {
        if (ev.status === "correct") {
          curr.earned += 1;
          curr.correct += 1;
        } else if (ev.status === "partial") {
          curr.earned += ev.scoreRatio;
        }
      }
      map.set(topic, curr);
    }

    return Array.from(map.entries()).map(([topic, stats]) => ({
      topic,
      total: stats.total,
      correct: stats.correct,
      percent: Math.round((stats.earned / Math.max(1, stats.total)) * 100),
    }));
  }, [questions, evaluations]);

  const strengths = topicBreakdown.filter((t) => t.percent >= 70);
  const weaknesses = topicBreakdown.filter((t) => t.percent < 60);

  const displayedQuestions = useMemo(() => {
    if (activeFilter === "review_needed") {
      return questions.filter((q) => {
        const ev = evaluations[q.id];
        return ev && ev.status !== "correct";
      });
    }
    return questions;
  }, [questions, evaluations, activeFilter]);

  return (
    <div className="max-w-4xl mx-auto py-6 px-4 space-y-8" dir="rtl">
      {/* Top Banner Result Card */}
      <Card className="border border-[var(--color-border)] p-6 sm:p-8 text-center space-y-6 shadow-xs bg-[var(--color-surface)]">
        <div
          className={`w-20 h-20 rounded-2xl flex items-center justify-center mx-auto text-white shadow-xs ${
            isPassing ? "bg-[#3d8f6e]" : "bg-[#c2853f]"
          }`}
        >
          <TrophyIcon className="w-10 h-10" />
        </div>

        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-[var(--color-text)]">
            {isPassing ? "آزمون با موفقیت گذرانده شد!" : "آزمون به پایان رسید"}
          </h2>
          <p className="text-sm text-[var(--color-text-muted)] mt-2">
            نتیجه عملکرد شما بر اساس ارزیابی رسمی و پاسخ‌های ثبت‌شده:
          </p>
        </div>

        <div className="inline-flex items-center gap-2 px-8 py-3 rounded-2xl bg-[var(--color-background)] border border-[var(--color-border)] shadow-inner">
          <span className="text-4xl font-black text-[var(--color-primary)] font-mono" dir="ltr">
            {scorePct}%
          </span>
        </div>

        {/* 4-way Summary Metric Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-xl mx-auto pt-2">
          <div className="p-3 rounded-xl bg-[#e4f4ec] border border-[#9ed4bb] text-center">
            <span className="text-xs text-[#2a624b] block font-semibold">پاسخ صحیح</span>
            <span className="text-xl font-bold font-mono text-[#2a624b] mt-1 block">
              {correctCount}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-[#fde8e8] border border-[#e8a0a0] text-center">
            <span className="text-xs text-[#7f3131] block font-semibold">پاسخ نادرست</span>
            <span className="text-xl font-bold font-mono text-[#7f3131] mt-1 block">
              {incorrectCount}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-center">
            <span className="text-xs text-[var(--color-text-muted)] block font-semibold">بدون پاسخ</span>
            <span className="text-xl font-bold font-mono text-[var(--color-text)] mt-1 block">
              {unansweredCount}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-[#fdf2e4] border border-[#e8c18a] text-center">
            <span className="text-xs text-[#8f5e27] block font-semibold">
              {partialCount > 0 ? "پاسخ ناقص" : "کل سوالات"}
            </span>
            <span className="text-xl font-bold font-mono text-[#8f5e27] mt-1 block">
              {partialCount > 0 ? partialCount : result.total}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-center gap-4 pt-2">
          <Button
            type="button"
            variant="outline"
            size="md"
            onClick={onRetry}
            leftIcon={<RefreshIcon className="w-4 h-4" />}
          >
            شرکت مجدد در آزمون
          </Button>
          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={onReturnToConfig}
          >
            بازگشت به تنظیمات آزمون
          </Button>
        </div>
      </Card>

      {/* Topic Performance Breakdown Card */}
      {topicBreakdown.length > 0 && (
        <Card className="border border-[var(--color-border)] p-6 space-y-5 bg-[var(--color-surface)] shadow-xs">
          <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-3">
            <h3 className="text-base font-bold text-[var(--color-text)] flex items-center gap-2">
              <span className="material-symbols-outlined text-[var(--color-primary)] text-lg">analytics</span>
              عملکرد به تفکیک مباحث آزمون
            </h3>
            <span className="text-xs text-[var(--color-text-muted)]">
              {topicBreakdown.length} مبحث ارزیابی‌شده
            </span>
          </div>

          <div className="space-y-4">
            {topicBreakdown.map((t, idx) => (
              <div key={idx} className="space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-[var(--color-text)] font-semibold">{t.topic}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[var(--color-text-muted)] font-mono">
                      {formatPersianOf(t.correct, t.total, { suffix: "صحیح" })}
                    </span>
                    <span
                      className={`font-bold font-mono ${
                        t.percent >= 70
                          ? "text-[#2a624b]"
                          : t.percent >= 50
                            ? "text-[#8f5e27]"
                            : "text-[#7f3131]"
                      }`}
                    >
                      {t.percent}%
                    </span>
                  </div>
                </div>
                <div className="w-full bg-[var(--color-surface-warm)] border border-[var(--color-border)] rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-2 rounded-full transition-all duration-500 ${
                      t.percent >= 70
                        ? "bg-[#3d8f6e]"
                        : t.percent >= 50
                          ? "bg-[#c2853f]"
                          : "bg-[#b84c4c]"
                    }`}
                    style={{ width: `${t.percent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Strengths and Weaknesses */}
          {(strengths.length > 0 || weaknesses.length > 0) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-[var(--color-border)]">
              <div className="p-3 bg-[#e4f4ec] border border-[#9ed4bb] rounded-xl space-y-1">
                <span className="text-xs font-bold text-[#2a624b] flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">trending_up</span>
                  نقاط قوت شما:
                </span>
                <p className="text-xs text-[var(--color-text)] leading-relaxed">
                  {strengths.length > 0
                    ? strengths.map((s) => s.topic).join("، ")
                    : "نیاز به تقویت در کلیه سرفصل‌ها برای رسیدن به تسلط پایدار."}
                </p>
              </div>

              <div className="p-3 bg-[#fde8e8] border border-[#e8a0a0] rounded-xl space-y-1">
                <span className="text-xs font-bold text-[#7f3131] flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">priority_high</span>
                  مباحث نیازمند مرور بیشتر:
                </span>
                <p className="text-xs text-[var(--color-text)] leading-relaxed">
                  {weaknesses.length > 0
                    ? weaknesses.map((w) => w.topic).join("، ")
                    : "عملکرد متعادل در تمام مباحث این آزمون."}
                </p>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Question-by-Question Review */}
      {questions.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--color-border)] pb-3">
            <h3 className="text-base font-bold text-[var(--color-text)] flex items-center gap-2">
              <span className="material-symbols-outlined text-[var(--color-primary)] text-lg">menu_book</span>
              مرور سوالات، پاسخ‌ها و توضیحات تشریحی
            </h3>

            {/* Filter Toggle Buttons */}
            <div className="flex items-center gap-2 bg-[var(--color-surface-warm)] p-1 rounded-xl border border-[var(--color-border)]">
              <button
                type="button"
                onClick={() => setActiveFilter("all")}
                className={`px-3 py-1.5 text-xs rounded-lg transition-all font-medium ${
                  activeFilter === "all"
                    ? "bg-[var(--color-surface)] text-[var(--color-text)] font-bold shadow-xs"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                }`}
              >
                همه سوالات ({toPersianDigits(questions.length)})
              </button>
              <button
                type="button"
                onClick={() => setActiveFilter("review_needed")}
                className={`px-3 py-1.5 text-xs rounded-lg transition-all font-medium ${
                  activeFilter === "review_needed"
                    ? "bg-[#fdf2e4] text-[#8f5e27] border border-[#e8c18a] font-bold shadow-xs"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                }`}
              >
                نیازمند مرور ({toPersianDigits(incorrectCount + unansweredCount + partialCount)})
              </button>
            </div>
          </div>

          {displayedQuestions.map((q, idx) => {
            const evaluation = evaluations[q.id] || {
              status: "unanswered",
              scoreRatio: 0,
              selectedValues: [],
              correctValues: [],
            };

            const status = evaluation.status;
            const selectedSet = new Set(evaluation.selectedValues);
            const correctSet = new Set(evaluation.correctValues);

            return (
              <Card
                key={q.id}
                className="border border-[var(--color-border)] p-6 space-y-4 shadow-xs bg-[var(--color-surface)]"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-[var(--color-primary)] font-mono">
                      سوال {toPersianDigits(idx + 1)}
                    </span>
                    {q.topic && (
                      <span className="text-[11px] px-2 py-0.5 rounded bg-[var(--color-surface-warm)] text-[var(--color-text-muted)] border border-[var(--color-border)]">
                        {q.topic}
                      </span>
                    )}
                  </div>

                  {status === "correct" && (
                    <Badge variant="success" size="md" className="gap-1 px-2.5 py-0.5">
                      <span className="material-symbols-outlined text-[14px]">check</span>
                      <span>پاسخ صحیح</span>
                    </Badge>
                  )}

                  {status === "incorrect" && (
                    <Badge variant="error" size="md" className="gap-1 px-2.5 py-0.5">
                      <span className="material-symbols-outlined text-[14px]">close</span>
                      <span>پاسخ نادرست</span>
                    </Badge>
                  )}

                  {status === "unanswered" && (
                    <Badge variant="neutral" size="md" className="gap-1 px-2.5 py-0.5">
                      <span className="material-symbols-outlined text-[14px]">help_outline</span>
                      <span>بدون پاسخ</span>
                    </Badge>
                  )}

                  {status === "partial" && (
                    <Badge variant="warning" size="md" className="gap-1 px-2.5 py-0.5">
                      <span className="material-symbols-outlined text-[14px]">remove</span>
                      <span>پاسخ ناقص ({Math.round(evaluation.scoreRatio * 100)}%)</span>
                    </Badge>
                  )}
                </div>

                <div className="text-sm font-bold text-[var(--color-text)] leading-relaxed">
                  <RichContent content={q.question} />
                </div>

                {status === "unanswered" && (
                  <div className="p-3 bg-[var(--color-surface-warm)] rounded-xl border border-[var(--color-border)] text-xs text-[var(--color-text-muted)] flex items-center gap-2">
                    <span className="material-symbols-outlined text-[var(--color-text-muted)] text-base">info</span>
                    <span>شما در زمان برگزاری آزمون به این سوال پاسخ نداده‌اید. گزینه صحیح با رنگ سبز مشخص شده است.</span>
                  </div>
                )}

                {q.choices && q.choices.length > 0 && (
                  <div className="space-y-2 pt-1">
                    {q.choices.map((choice, cIdx) => {
                      const isUserChoice = selectedSet.has(choice);
                      const isCorrectChoice = correctSet.has(choice);

                      let style = "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]";
                      if (isUserChoice && isCorrectChoice) {
                        style = "border-[#9ed4bb] bg-[#e4f4ec] text-[#2a624b] font-bold shadow-xs";
                      } else if (isUserChoice && !isCorrectChoice) {
                        style = "border-[#e8a0a0] bg-[#fde8e8] text-[#7f3131] font-bold shadow-xs";
                      } else if (!isUserChoice && isCorrectChoice) {
                        style = "border-[#9ed4bb] bg-[#e4f4ec]/50 text-[#2a624b] font-semibold";
                      }

                      return (
                        <div
                          key={cIdx}
                          className={`p-3.5 rounded-xl text-xs border flex items-center justify-between gap-3 transition-colors ${style}`}
                        >
                          <div className="flex items-center gap-2 flex-1">
                            <span className="font-mono font-bold">{cIdx + 1}.</span>
                            <div className="flex-1">
                              <RichContent content={choice} inline />
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {isUserChoice && isCorrectChoice && (
                              <Badge
                                variant="success"
                                size="sm"
                                className="text-[11px] font-bold px-2 py-0.5 gap-1"
                              >
                                <span className="material-symbols-outlined text-[13px]">check</span>
                                پاسخ صحیح شما
                              </Badge>
                            )}

                            {isUserChoice && !isCorrectChoice && (
                              <Badge
                                variant="error"
                                size="sm"
                                className="text-[11px] font-bold px-2 py-0.5 gap-1"
                              >
                                <span className="material-symbols-outlined text-[13px]">close</span>
                                پاسخ شما (نادرست)
                              </Badge>
                            )}

                            {!isUserChoice && isCorrectChoice && (
                              <Badge
                                variant="success"
                                size="sm"
                                className="text-[11px] font-bold px-2 py-0.5 gap-1"
                              >
                                {status === "unanswered" ? "پاسخ صحیح" : "گزینه صحیح انتخاب‌نشده"}
                              </Badge>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {q.explanation && (
                  <div className="p-4 bg-[var(--color-surface-warm)] rounded-xl border border-[var(--color-border)] text-xs space-y-1.5 mt-2">
                    <p className="font-bold text-[var(--color-text)] flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-sm text-[var(--color-primary)]">lightbulb</span>
                      <span>تحلیل تشریحی و راهنمایی آموزشی:</span>
                    </p>
                    <div className="text-[var(--color-text-secondary)] leading-relaxed">
                      <RichContent content={q.explanation} />
                    </div>
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
