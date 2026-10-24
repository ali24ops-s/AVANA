import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  BarChart2,
  ArrowLeft,
  AlertTriangle,
  TrendingUp,
  BookOpen,
  Check,
  X,
  HelpCircle,
  Minus,
  Lightbulb,
  ChevronDown,
  Sparkles,
} from "lucide-react";
import { TrophyIcon, RefreshIcon } from "./ExamIcons.js";
import { RichContent } from "../markdown/MarkdownRenderer.js";
import { AvaniAvatar } from "../brand/AvaniAvatar.js";
import { Button, Card, Badge } from "@avana/ui";
import { StudyAssistantChat, type QuestionMentorState } from "../ai/StudyAssistantChat.js";
import {
  evaluateQuestionAnswer,
  type QuestionEvaluationResult,
  toPersianDigits,
  formatPersianOf,
} from "@avana/domain";
import { isInternalIdentifier } from "../../lib/utils/exam-title-formatter.js";

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
      lesson?: { id: string; title: string } | null;
      chapter?: { id: string; title: string } | null;
      course?: { id: string; title: string } | null;
    }>;
  };
  onRetry: () => void | Promise<void>;
  onReturnToConfig: () => void;
  isRetrying?: boolean;
}

export function ExamResultView({
  result,
  onRetry,
  onReturnToConfig,
  isRetrying = false,
}: ExamResultViewProps) {
  const scorePct = Math.round(result.score);
  const isPassing = scorePct >= 60;
  const questions = result.questions || [];

  const [activeFilter, setActiveFilter] = useState<"all" | "review_needed">("all");
  const [mentorConversations, setMentorConversations] = useState<Record<string, QuestionMentorState>>({});
  const [activeMentorQuestionId, setActiveMentorQuestionId] = useState<string | null>(null);
  const [expandedSources, setExpandedSources] = useState<Record<string, boolean>>({});

  const isMultiChapterExam = useMemo(() => {
    const chapters = new Set(
      questions.map((q) => q.chapter?.id || q.chapter?.title).filter(Boolean)
    );
    return chapters.size > 1;
  }, [questions]);

  const toggleSource = useCallback((questionId: string) => {
    setExpandedSources((prev) => ({
      ...prev,
      [questionId]: !prev[questionId],
    }));
  }, []);

  const handleMentorConversationChange = useCallback(
    (state: QuestionMentorState, questionId?: string) => {
      if (!questionId) return;
      setMentorConversations((prev) => ({
        ...prev,
        [questionId]: state,
      }));
    },
    []
  );

  const lastActiveElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (activeMentorQuestionId) {
      lastActiveElementRef.current = document.activeElement as HTMLElement | null;
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          setActiveMentorQuestionId(null);
        }
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => {
        window.removeEventListener("keydown", handleKeyDown);
      };
    } else if (lastActiveElementRef.current) {
      lastActiveElementRef.current.focus?.();
      lastActiveElementRef.current = null;
    }
  }, [activeMentorQuestionId]);

  const activeMentorQuestion = useMemo(() => {
    if (!activeMentorQuestionId) return null;
    const idx = questions.findIndex((q) => q.id === activeMentorQuestionId);
    if (idx === -1) return null;
    return {
      question: questions[idx],
      questionIndex: idx,
    };
  }, [activeMentorQuestionId, questions]);

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
    const map = new Map<
      string,
      {
        total: number;
        earned: number;
        correct: number;
        incorrect: number;
        unanswered: number;
        partial: number;
        lessonId?: string;
        courseId?: string;
        chapterTitle?: string;
      }
    >();

    for (const q of questions) {
      const rawTopic = q.topic?.trim();
      const topic =
        rawTopic && !isInternalIdentifier(rawTopic)
          ? rawTopic
          : q.lesson?.title?.trim() ||
            q.chapter?.title?.trim() ||
            q.course?.title?.trim() ||
            "مباحث جامع";

      const ev = evaluations[q.id];
      const curr = map.get(topic) || {
        total: 0,
        earned: 0,
        correct: 0,
        incorrect: 0,
        unanswered: 0,
        partial: 0,
      };

      curr.total += 1;
      if (q.lesson?.id) curr.lessonId = q.lesson.id;
      if (q.course?.id) curr.courseId = q.course.id;
      if (q.chapter?.title) curr.chapterTitle = q.chapter.title;

      if (ev) {
        if (ev.status === "correct") {
          curr.earned += 1;
          curr.correct += 1;
        } else if (ev.status === "partial") {
          curr.earned += ev.scoreRatio;
          curr.partial += 1;
        } else if (ev.status === "unanswered") {
          curr.unanswered += 1;
        } else {
          curr.incorrect += 1;
        }
      }
      map.set(topic, curr);
    }

    const items = Array.from(map.entries()).map(([topic, stats]) => {
      const percent = Math.round((stats.earned / Math.max(1, stats.total)) * 100);
      const studyUrl =
        stats.courseId && stats.lessonId
          ? `/courses/${stats.courseId}?lessonId=${stats.lessonId}`
          : stats.courseId
            ? `/courses/${stats.courseId}`
            : undefined;

      return {
        topic,
        total: stats.total,
        correct: stats.correct,
        incorrect: stats.incorrect,
        unanswered: stats.unanswered,
        partial: stats.partial,
        percent,
        studyUrl,
        chapterTitle: stats.chapterTitle,
      };
    });

    // Sort from weakest to strongest (ascending) so areas needing attention are immediately prominent
    return items.sort((a, b) => a.percent - b.percent);
  }, [questions, evaluations]);

  const strengths = useMemo(
    () => topicBreakdown.filter((t) => t.percent >= 70),
    [topicBreakdown],
  );
  const weaknesses = useMemo(
    () => topicBreakdown.filter((t) => t.percent < 60),
    [topicBreakdown],
  );

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
    <div className="max-w-4xl mx-auto py-5 px-4 space-y-6" dir="rtl">
      {/* Top Banner Result Card — Compact, Balanced & Streamlined */}
      <Card className="border border-[var(--color-border)] p-4 sm:p-5 space-y-4 shadow-xs bg-[var(--color-surface)] rounded-2xl">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          {/* Avatar + Title + Status */}
          <div className="flex items-center gap-3.5 text-center sm:text-start w-full sm:w-auto justify-center sm:justify-start">
            <div
              className={`w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-2xs ${
                isPassing ? "bg-[#e8f5e9] border border-[#a5d6a7]" : "bg-[#fff8e1] border border-[#ffe082]"
              }`}
            >
              <AvaniAvatar
                variant={isPassing ? "success" : "encouraging"}
                size={38}
                alt={isPassing ? "آزمون با موفقیت گذرانده شد" : "نیاز به تمرین و مرور مجدد"}
                asInlineSvg={true}
              />
            </div>
            <div>
              <div className="flex items-center gap-2 justify-center sm:justify-start">
                <h2 className="text-base sm:text-lg font-bold text-[var(--color-text)]">
                  {isPassing ? "آزمون با موفقیت گذرانده شد!" : "آزمون به پایان رسید"}
                </h2>
                <Badge variant={isPassing ? "success" : "warning"} size="sm">
                  {isPassing ? "قبول" : "نیاز به مرور"}
                </Badge>
              </div>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                نتیجه عملکرد شما بر اساس ارزیابی رسمی و پاسخ‌های ثبت‌شده:
              </p>
            </div>
          </div>

          {/* Score Badge */}
          <div className="flex items-center gap-3 shrink-0 self-center">
            <div className="px-3.5 py-1.5 rounded-xl bg-[var(--color-background)] border border-[var(--color-border)] shadow-2xs flex items-center gap-2">
              <span className="text-xs text-[var(--color-text-muted)] font-medium">نمره نهایی:</span>
              <span className="text-xl sm:text-2xl font-black text-[var(--color-primary)] font-mono">
                {toPersianDigits(scorePct)}٪
              </span>
            </div>
          </div>
        </div>

        {/* 4-way Summary Metric Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
          <div className="p-2.5 rounded-xl bg-[#e4f4ec] border border-[#9ed4bb] text-center">
            <span className="text-xs text-[#2a624b] block font-semibold">پاسخ صحیح</span>
            <span className="text-lg font-bold font-mono text-[#2a624b] mt-0.5 block">
              {toPersianDigits(correctCount)}
            </span>
          </div>

          <div className="p-2.5 rounded-xl bg-[#fde8e8] border border-[#e8a0a0] text-center">
            <span className="text-xs text-[#7f3131] block font-semibold">پاسخ نادرست</span>
            <span className="text-lg font-bold font-mono text-[#7f3131] mt-0.5 block">
              {toPersianDigits(incorrectCount)}
            </span>
          </div>

          <div className="p-2.5 rounded-xl bg-[#fdf2e4] border border-[#e8c18a] text-center">
            <span className="text-xs text-[#8f5e27] block font-semibold">بدون پاسخ</span>
            <span className="text-lg font-bold font-mono text-[#8f5e27] mt-0.5 block">
              {toPersianDigits(unansweredCount)}
            </span>
          </div>

          <div className="p-2.5 rounded-xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-center">
            <span className="text-xs text-[var(--color-text-muted)] block font-semibold">
              {partialCount > 0 ? "پاسخ ناقص" : "کل سوالات"}
            </span>
            <span className="text-lg font-bold font-mono text-[var(--color-text)] mt-0.5 block">
              {toPersianDigits(partialCount > 0 ? partialCount : result.total)}
            </span>
          </div>
        </div>

        {/* Action Buttons Row */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5 pt-1 border-t border-[var(--color-border)]/60">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRetry}
            disabled={isRetrying}
            isLoading={isRetrying}
            leftIcon={<RefreshIcon className="w-3.5 h-3.5" />}
            className="w-full sm:w-auto"
          >
            شرکت مجدد در آزمون
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={onReturnToConfig}
            className="w-full sm:w-auto"
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
              <BarChart2 className="w-5 h-5 text-[var(--color-primary)]" />
              عملکرد به تفکیک مباحث آزمون
            </h3>
            <span className="text-xs text-[var(--color-text-muted)]">
              {toPersianDigits(topicBreakdown.length)} مبحث ارزیابی‌شده
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3.5">
            {topicBreakdown.map((t, idx) => {
              const isMastered = t.percent >= 70;
              const needsReview = t.percent >= 60 && t.percent < 70;

              const statusVariant = isMastered ? "success" : needsReview ? "warning" : "error";
              const statusLabel = isMastered ? "تسلط مطلوب" : needsReview ? "نیازمند مرور" : "نیازمند تمرکز";
              const progressBarColor = isMastered ? "bg-[#3d8f6e]" : needsReview ? "bg-[#c2853f]" : "bg-[#b84c4c]";
              const percentColor = isMastered ? "text-[#2a624b]" : needsReview ? "text-[#8f5e27]" : "text-[#7f3131]";

              return (
                <div
                  key={idx}
                  className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-primary)]/40 transition-all shadow-2xs space-y-3"
                >
                  {/* Header: Title, Chapter & Badges */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-[var(--color-text)] truncate">
                          {t.topic}
                        </span>
                        <Badge variant={statusVariant} size="sm">
                          {statusLabel}
                        </Badge>
                      </div>
                      {t.chapterTitle && (
                        <p className="text-[11px] text-[var(--color-text-muted)] truncate">
                          سرفصل: {t.chapterTitle}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                      <span className={`text-lg font-black font-mono ${percentColor}`}>
                        {toPersianDigits(t.percent)}٪
                      </span>
                      {t.studyUrl && (
                        <Link
                          to={t.studyUrl}
                          className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline bg-primary/10 hover:bg-primary/20 px-2.5 py-1 rounded-lg transition-colors"
                        >
                          <span>مطالعه جلسه</span>
                          <ArrowLeft className="w-3.5 h-3.5" />
                        </Link>
                      )}
                    </div>
                  </div>

                  {/* Visual Progress Bar */}
                  <div className="w-full bg-[var(--color-surface-warm)] border border-[var(--color-border)] rounded-full h-2.5 overflow-hidden">
                    <div
                      className={`h-2.5 rounded-full transition-all duration-500 ${progressBarColor}`}
                      style={{ width: `${Math.max(2, t.percent)}%` }}
                    />
                  </div>

                  {/* Granular Counts Breakdown: درست · غلط · بدون پاسخ */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--color-text-secondary)] pt-0.5 border-t border-[var(--color-border)]/50">
                    <span className="flex items-center gap-1 text-[#2a624b] font-medium">
                      <span className="w-2 h-2 rounded-full bg-[#3d8f6e]" />
                      <span>{toPersianDigits(t.correct)} درست</span>
                    </span>
                    <span className="text-[var(--color-border)]">·</span>
                    <span className="flex items-center gap-1 text-[#7f3131] font-medium">
                      <span className="w-2 h-2 rounded-full bg-[#b84c4c]" />
                      <span>{toPersianDigits(t.incorrect)} غلط</span>
                    </span>
                    {t.unanswered > 0 && (
                      <>
                        <span className="text-[var(--color-border)]">·</span>
                        <span className="flex items-center gap-1 text-[#8f5e27] font-medium">
                          <span className="w-2 h-2 rounded-full bg-[#c2853f]" />
                          <span>{toPersianDigits(t.unanswered)} بدون پاسخ</span>
                        </span>
                      </>
                    )}
                    {t.partial > 0 && (
                      <>
                        <span className="text-[var(--color-border)]">·</span>
                        <span className="flex items-center gap-1 text-[#8f5e27] font-medium">
                          <span className="w-2 h-2 rounded-full bg-[#c2853f]" />
                          <span>{toPersianDigits(t.partial)} پاسخ ناقص</span>
                        </span>
                      </>
                    )}
                    <span className="ms-auto text-[11px] text-[var(--color-text-muted)] font-mono">
                      {formatPersianOf(t.correct, t.total, { suffix: "صحیح" })}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Strengths and Weaknesses Grid */}
          {(strengths.length > 0 || weaknesses.length > 0) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-[var(--color-border)]">
              {/* Weaknesses (مباحث نیازمند مرور بیشتر) */}
              <div className="p-4 bg-[#fde8e8]/70 border border-[#e8a0a0] rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#7f3131] flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" />
                    مباحث نیازمند مرور و تقویت:
                  </span>
                  {weaknesses.length > 0 && (
                    <span className="text-[11px] font-bold text-[#7f3131] bg-[#fde8e8] px-2 py-0.5 rounded-md border border-[#e8a0a0]">
                      {toPersianDigits(weaknesses.length)} مبحث
                    </span>
                  )}
                </div>

                {weaknesses.length > 0 ? (
                  <div className="space-y-2">
                    {weaknesses.map((w, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-[var(--color-surface)] border border-[#e8a0a0]/60 text-xs shadow-2xs"
                      >
                        <div className="flex flex-col min-w-0 flex-1">
                          {w.studyUrl ? (
                            <Link
                              to={w.studyUrl}
                              className="font-bold text-[#7f3131] hover:underline flex items-center gap-1 group truncate"
                            >
                              <span className="truncate">{w.topic}</span>
                              <ArrowLeft className="w-3.5 h-3.5 shrink-0 text-primary opacity-80 group-hover:translate-x-[-2px] transition-transform" />
                            </Link>
                          ) : (
                            <span className="font-bold text-[var(--color-text)] truncate">{w.topic}</span>
                          )}
                          {w.chapterTitle && (
                            <span className="text-[10px] text-[var(--color-text-muted)] truncate">
                              سرفصل: {w.chapterTitle}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs font-bold font-mono text-[#7f3131]">
                            {toPersianDigits(w.percent)}٪
                          </span>
                          {w.studyUrl && (
                            <Link
                              to={w.studyUrl}
                              className="px-2 py-1 rounded-lg bg-[#fde8e8] text-[#7f3131] border border-[#e8a0a0] text-[11px] font-bold hover:bg-[#7f3131] hover:text-white transition-colors"
                            >
                              مطالعه
                            </Link>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                    عملکرد متعادل در تمام مباحث این آزمون؛ نقطه ضعف حادی ثبت نشد.
                  </p>
                )}
              </div>

              {/* Strengths (نقاط قوت شما) */}
              <div className="p-4 bg-[#e4f4ec]/70 border border-[#9ed4bb] rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#2a624b] flex items-center gap-1.5">
                    <TrendingUp className="w-4 h-4" />
                    نقاط قوت و تسلط بالا:
                  </span>
                  {strengths.length > 0 && (
                    <span className="text-[11px] font-bold text-[#2a624b] bg-[#e4f4ec] px-2 py-0.5 rounded-md border border-[#9ed4bb]">
                      {toPersianDigits(strengths.length)} مبحث
                    </span>
                  )}
                </div>

                {strengths.length > 0 ? (
                  <div className="space-y-2">
                    {strengths.map((s, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-[var(--color-surface)] border border-[#9ed4bb]/60 text-xs shadow-2xs"
                      >
                        <div className="flex flex-col min-w-0 flex-1">
                          {s.studyUrl ? (
                            <Link
                              to={s.studyUrl}
                              className="font-bold text-[#2a624b] hover:underline flex items-center gap-1 group truncate"
                            >
                              <span className="truncate">{s.topic}</span>
                              <ArrowLeft className="w-3.5 h-3.5 shrink-0 text-primary opacity-80 group-hover:translate-x-[-2px] transition-transform" />
                            </Link>
                          ) : (
                            <span className="font-bold text-[var(--color-text)] truncate">{s.topic}</span>
                          )}
                          {s.chapterTitle && (
                            <span className="text-[10px] text-[var(--color-text-muted)] truncate">
                              سرفصل: {s.chapterTitle}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs font-bold font-mono text-[#2a624b]">
                            {toPersianDigits(s.percent)}٪
                          </span>
                          {s.studyUrl && (
                            <Link
                              to={s.studyUrl}
                              className="px-2 py-1 rounded-lg bg-[#e4f4ec] text-[#2a624b] border border-[#9ed4bb] text-[11px] font-bold hover:bg-[#2a624b] hover:text-white transition-colors"
                            >
                              مرور
                            </Link>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                    نیاز به تقویت در کلیه سرفصل‌ها برای رسیدن به تسلط پایدار.
                  </p>
                )}
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
              <BookOpen className="w-5 h-5 text-[var(--color-primary)]" />
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

            const originalIndex = questions.findIndex((item) => item.id === q.id);
            const questionNumber = originalIndex !== -1 ? originalIndex + 1 : idx + 1;

            const hasLesson = Boolean(q.lesson?.title?.trim());
            const hasChapter = Boolean(q.chapter?.title?.trim());
            const hasTopic = Boolean(q.topic?.trim() && !isInternalIdentifier(q.topic.trim()));
            const hasSourceInfo = hasLesson || hasChapter || hasTopic;

            const studyUrl =
              q.course?.id && q.lesson?.id
                ? `/courses/${q.course.id}?lessonId=${q.lesson.id}`
                : q.course?.id
                  ? `/courses/${q.course.id}`
                  : undefined;

            return (
              <Card
                key={q.id}
                className="border border-[var(--color-border)] p-4 sm:p-5 space-y-3.5 shadow-xs bg-[var(--color-surface)] rounded-2xl"
              >
                {/* Card Top Row: Status Badge & Actions */}
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-[var(--color-border)]/70">
                  <div className="flex items-center gap-2">
                    {status === "correct" && (
                      <Badge variant="success" size="md" className="gap-1 px-2.5 py-0.5">
                        <Check className="w-3.5 h-3.5" />
                        <span>پاسخ صحیح</span>
                      </Badge>
                    )}

                    {status === "incorrect" && (
                      <Badge variant="error" size="md" className="gap-1 px-2.5 py-0.5">
                        <X className="w-3.5 h-3.5" />
                        <span>پاسخ نادرست</span>
                      </Badge>
                    )}

                    {status === "unanswered" && (
                      <Badge variant="warning" size="md" className="gap-1 px-2.5 py-0.5">
                        <HelpCircle className="w-3.5 h-3.5" />
                        <span>بدون پاسخ</span>
                      </Badge>
                    )}

                    {status === "partial" && (
                      <Badge variant="warning" size="md" className="gap-1 px-2.5 py-0.5">
                        <Minus className="w-3.5 h-3.5" />
                        <span>پاسخ ناقص ({toPersianDigits(Math.round(evaluation.scoreRatio * 100))}٪)</span>
                      </Badge>
                    )}
                  </div>

                  {/* Secondary Actions: Source Accordion Trigger + Ask AI Mentor */}
                  <div className="flex items-center gap-2">
                    {hasSourceInfo && (
                      <button
                        type="button"
                        onClick={() => toggleSource(q.id)}
                        aria-expanded={Boolean(expandedSources[q.id])}
                        className="inline-flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-primary)] py-1 px-2 rounded-lg hover:bg-[var(--color-surface-warm)] transition-colors cursor-pointer"
                      >
                        <BookOpen className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                        <span>مشاهده مبحث مرتبط</span>
                        <ChevronDown
                          className={`w-3.5 h-3.5 transition-transform duration-200 ${
                            expandedSources[q.id] ? "rotate-180" : ""
                          }`}
                        />
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setActiveMentorQuestionId(q.id)}
                      aria-label={`راهنمایی از منتور هوشمند برای سوال ${toPersianDigits(questionNumber)}`}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--color-primary)] bg-[var(--color-primary-soft)] hover:bg-[var(--color-primary)]/20 px-2.5 py-1 rounded-lg transition-colors cursor-pointer border border-[var(--color-primary)]/25"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                      <span>راهنمایی از منتور هوشمند</span>
                    </button>
                  </div>
                </div>

                {/* Question Prompt Section: Question Number & Question Text in One Row */}
                <div className="flex items-start gap-2.5 sm:gap-3 text-start">
                  <span className="shrink-0 flex-none text-xs font-bold text-[var(--color-primary)] bg-[var(--color-surface-warm)] border border-[var(--color-border)] px-2.5 py-1 rounded-lg mt-0.5 whitespace-nowrap select-none font-mono">
                    سوال {toPersianDigits(questionNumber)}
                  </span>
                  <div className="flex-1 min-w-0 text-sm sm:text-base font-bold text-[var(--color-text)] leading-relaxed">
                    <RichContent content={q.question} />
                  </div>
                </div>

                {/* Collapsible Source Accordion Details */}
                {hasSourceInfo && expandedSources[q.id] && (
                  <div className="p-3 rounded-xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-xs space-y-1.5 animate-in fade-in duration-150">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="space-y-0.5">
                        {hasChapter && (
                          <p className="text-[var(--color-text-muted)] font-medium">
                            سرفصل: {q.chapter?.title}
                          </p>
                        )}
                        {hasLesson && (
                          <p className="text-[var(--color-text-muted)] font-medium">
                            درس: {q.chapter?.title ? `${q.chapter.title} — ${q.lesson?.title ?? ""}` : q.lesson?.title}
                          </p>
                        )}
                        {!hasLesson && hasTopic && (
                          <p className="text-[var(--color-text-muted)] font-medium">
                            درس: {q.topic}
                          </p>
                        )}
                      </div>
                      {studyUrl && (
                        <Link
                          to={studyUrl}
                          className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline bg-primary/10 hover:bg-primary/20 px-2.5 py-1 rounded-lg transition-colors"
                        >
                          <span>مطالعه جلسه</span>
                          <ArrowLeft className="w-3.5 h-3.5" />
                        </Link>
                      )}
                    </div>
                  </div>
                )}

                {status === "unanswered" && (
                  <div className="p-3 bg-[#fdf2e4] rounded-xl border border-[#e8c18a] text-xs text-[#8f5e27] flex items-center gap-2">
                    <HelpCircle className="w-4 h-4 text-[#8f5e27] shrink-0" />
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
                            <span className="font-mono font-bold">{toPersianDigits(cIdx + 1)}.</span>
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
                                <Check className="w-3 h-3" />
                                پاسخ صحیح شما
                              </Badge>
                            )}

                            {isUserChoice && !isCorrectChoice && (
                              <Badge
                                variant="error"
                                size="sm"
                                className="text-[11px] font-bold px-2 py-0.5 gap-1"
                              >
                                <X className="w-3 h-3" />
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
                      <Lightbulb className="w-4 h-4 text-[var(--color-primary)]" />
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

      {/* Mentor Modal */}
      {activeMentorQuestion && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
          id="mentor-modal-overlay"
          onClick={() => setActiveMentorQuestionId(null)}
        >
          <div
            className="relative z-10 w-full sm:w-[580px] md:w-[620px] max-w-[95vw] h-[85vh] sm:h-[650px] max-h-[88vh] rounded-2xl shadow-modal border border-[var(--color-border)] bg-[var(--color-surface)] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
            role="dialog"
            aria-modal="true"
            aria-label={`راهنمای منتور هوشمند - سوال ${toPersianDigits(activeMentorQuestion.questionIndex + 1)}`}
            onClick={(e) => e.stopPropagation()}
          >
            <StudyAssistantChat
              contextType="exam_analysis"
              examQuestion={{
                questionId: activeMentorQuestion.question.id,
                questionNumber: activeMentorQuestion.questionIndex + 1,
                questionText: activeMentorQuestion.question.question,
                choices: activeMentorQuestion.question.choices,
                selectedChoice:
                  evaluations[activeMentorQuestion.question.id]?.selectedValues?.length > 0
                    ? evaluations[activeMentorQuestion.question.id].selectedValues.join("، ")
                    : null,
                correctChoice:
                  evaluations[activeMentorQuestion.question.id]?.correctValues?.length > 0
                    ? evaluations[activeMentorQuestion.question.id].correctValues.join("، ")
                    : activeMentorQuestion.question.correctAnswer
                      ? String(activeMentorQuestion.question.correctAnswer)
                      : null,
                userAnswerStatus: evaluations[activeMentorQuestion.question.id]?.status,
                explanation: activeMentorQuestion.question.explanation || null,
                topic:
                  activeMentorQuestion.question.topic &&
                  !isInternalIdentifier(activeMentorQuestion.question.topic)
                    ? activeMentorQuestion.question.topic
                    : null,
                lessonId: activeMentorQuestion.question.lesson?.id || null,
                lessonTitle: activeMentorQuestion.question.lesson?.title || null,
                chapterTitle: activeMentorQuestion.question.chapter?.title || null,
                isMultiChapterExam,
              }}
              conversationState={mentorConversations[activeMentorQuestion.question.id]}
              onConversationStateChange={handleMentorConversationChange}
              autoStartGuidance={!mentorConversations[activeMentorQuestion.question.id]}
              onClose={() => setActiveMentorQuestionId(null)}
              className="h-full w-full border-none shadow-none rounded-none flex-1 min-h-0"
            />
          </div>
        </div>
      )}
    </div>
  );
}
