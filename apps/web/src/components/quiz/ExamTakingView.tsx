import { useState, useEffect, useMemo } from "react";
import { X } from "lucide-react";
import { createApiClient, getApiBaseUrl } from "../../lib/api/client.js";
import { createStudyApi } from "../../lib/api/study.js";
import { useStudySessionTracker } from "../../hooks/useStudySessionTracker.js";
import type { ExamCoverageCourse } from "@avana/domain";
import { toPersianDigits, formatPersianOf } from "@avana/domain";
import { BrandLogo } from "../brand/BrandLogo.js";
import { ExamHierarchyHeader } from "./ExamHierarchyHeader.js";
import {
  formatExamDisplayTitle,
  isInternalIdentifier,
} from "../../lib/utils/exam-title-formatter.js";
import { RichContent } from "../markdown/MarkdownRenderer.js";

export interface ExamTakingViewProps {
  organizationId: string;
  attemptId: string;
  questions: Array<{
    id: string;
    quizId?: string;
    question: string;
    choices: string[] | null;
    topic?: string | null;
    difficulty?: string | null;
    questionType?: string;
    explanation?: string | null;
    keyPoint?: string | null;
    keyPoints?: string[] | null;
  }>;
  initialAnswers?: Record<string, unknown>;
  startedAt?: string;
  topicName?: string;
  coverage?: ExamCoverageCourse[];
  onExit: () => void;
  onSubmitSuccess: (result: unknown) => void;
}

export function ExamTakingView({
  organizationId,
  attemptId,
  questions,
  initialAnswers,
  startedAt,
  topicName,
  coverage,
  onExit,
  onSubmitSuccess,
}: ExamTakingViewProps) {
  const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
  const studyApi = createStudyApi(apiClient);

  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>(initialAnswers || {});
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Controlled disclosure state for lesson source (tracked independently per question ID)
  const [revealedQuestionIds, setRevealedQuestionIds] = useState<Record<string, boolean>>({});

  // Track active educational study time for exam taking
  useStudySessionTracker({
    activityType: "exam",
    enabled: questions.length > 0 && !isSubmitting,
  });

  // Modals state
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
  const [showAiMentor, setShowAiMentor] = useState<boolean>(false);

  // Timer state (elapsed seconds calculated from backend startedAt timestamp)
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(() => {
    if (!startedAt) return 0;
    const startTime = new Date(startedAt).getTime();
    if (isNaN(startTime)) return 0;
    return Math.max(0, Math.floor((Date.now() - startTime) / 1000));
  });

  useEffect(() => {
    if (!startedAt) return;
    const interval = setInterval(() => {
      const startTime = new Date(startedAt).getTime();
      if (!isNaN(startTime)) {
        setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startTime) / 1000)));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  // Sync initialAnswers if updated from backend on load
  useEffect(() => {
    if (initialAnswers && Object.keys(initialAnswers).length > 0) {
      setAnswers((prev) => ({ ...initialAnswers, ...prev }));
    }
  }, [initialAnswers]);

  if (!questions || questions.length === 0) {
    return (
      <div className="max-w-2xl mx-auto py-16 px-4 text-center" dir="rtl">
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-8 shadow-xs">
          <span className="material-symbols-outlined text-[var(--avana-warning)] text-5xl mb-4">warning</span>
          <h3 className="text-xl font-bold text-[var(--color-text)] mb-2">هیچ سوالی برای این آزمون یافت نشد</h3>
          <p className="text-[var(--color-text-muted)] text-sm mb-6">لطفاً سرفصل‌های دیگری را برای آزمون انتخاب فرمایید.</p>
          <button
            type="button"
            onClick={onExit}
            className="px-6 py-2.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white rounded-xl text-sm transition-all shadow-xs font-semibold"
          >
            بازگشت به تنظیمات آزمون
          </button>
        </div>
      </div>
    );
  }

  const currentQuestion = questions[currentIndex];
  const totalQuestions = questions.length;
  const isLastQuestion = currentIndex === totalQuestions - 1;
  const selectedAnswer = currentQuestion ? answers[currentQuestion.id] : undefined;

  const answeredCount = useMemo(() => {
    return Object.keys(answers).filter(
      (key) => answers[key] !== null && answers[key] !== undefined && answers[key] !== "",
    ).length;
  }, [answers]);

  const unansweredCount = totalQuestions - answeredCount;
  const progressPercent = Math.round(((currentIndex + 1) / totalQuestions) * 100);

  // Format timer MM:SS
  const formatTimer = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const handleSelectChoice = async (choice: string) => {
    if (isSubmitting) return;

    // Optimistic UI update
    const updatedAnswers = { ...answers, [currentQuestion.id]: choice };
    setAnswers(updatedAnswers);

    // Save answer to backend asynchronously
    try {
      await studyApi.saveExamAnswers(organizationId, attemptId, {
        answers: [{ questionId: currentQuestion.id, answer: choice }],
      });
    } catch {
      // Ignore background save errors gracefully without breaking student flow
    }
  };

  const handleToggleSource = (questionId: string) => {
    setRevealedQuestionIds((prev) => ({
      ...prev,
      [questionId]: !prev[questionId],
    }));
  };

  const handleFinalSubmit = async () => {
    setErrorMsg(null);
    setIsSubmitting(true);
    try {
      const formattedAnswers = questions.map((q) => ({
        questionId: q.id,
        answer: answers[q.id] ?? null,
      }));

      const res = await studyApi.submitExamAttempt(organizationId, attemptId, {
        answers: formattedAnswers,
      });

      setShowConfirmModal(false);
      onSubmitSuccess(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : undefined;
      setErrorMsg(msg || "خطا در ثبت نتیجه آزمون. لطفاً دوباره تلاش کنید.");
      setIsSubmitting(false);
    }
  };

  // Sanitize topic display to prevent internal UUIDs/IDs from leaking into UI
  const displayTopic = formatExamDisplayTitle(
    topicName || currentQuestion?.topic,
    "فارماکولوژی قلب و عروق",
  );
  const currentQuestionTopic =
    currentQuestion?.topic && !isInternalIdentifier(currentQuestion.topic)
      ? currentQuestion.topic
      : undefined;

  const isSourceRevealed = Boolean(currentQuestion && revealedQuestionIds[currentQuestion.id]);

  // Derive key point strictly from actual question data (no generic fallback, no regex guessing)
  const questionKeyPoint = useMemo(() => {
    const rawKp = currentQuestion?.keyPoint;
    if (typeof rawKp === "string" && rawKp.trim()) return rawKp.trim();
    const rawKps = currentQuestion?.keyPoints;
    if (Array.isArray(rawKps) && rawKps.length > 0 && typeof rawKps[0] === "string" && rawKps[0].trim()) {
      return rawKps.join("\n");
    }
    return null;
  }, [currentQuestion]);

  return (
    <div className="bg-[var(--color-bg-default)] text-[var(--color-text)] font-body-md h-screen w-full min-w-0 max-w-full overflow-hidden flex antialiased selection:bg-[var(--color-primary)] selection:text-white" dir="rtl">
      {/* Sidebar Navigation (Right in RTL) */}
      <aside className="w-72 shrink-0 h-full hidden md:flex flex-col bg-[var(--color-surface)] border-l border-[var(--color-border)] z-20 overflow-hidden">
        {/* Sidebar Header */}
        <div className="p-4 border-b border-[var(--color-border)] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[var(--color-primary)] text-[20px]">grid_view</span>
            <h3 className="text-[var(--color-text)] font-bold text-base">نقشه آزمون</h3>
          </div>
          <span className="text-xs text-[var(--color-text-muted)] font-mono bg-[var(--color-surface-warm)] border border-[var(--color-border)] px-2 py-0.5 rounded">
            {currentIndex + 1} / {totalQuestions}
          </span>
        </div>

        {/* Scrollable Question Numbers Grid */}
        <div className="flex-1 overflow-y-auto p-4 min-h-0">
          <div className="grid grid-cols-5 gap-2" dir="ltr">
            {questions.map((q, idx) => {
              const isCurrent = idx === currentIndex;
              const isAns = answers[q.id] !== undefined && answers[q.id] !== null && answers[q.id] !== "";

              if (isCurrent) {
                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setCurrentIndex(idx)}
                    className="w-10 h-10 rounded-lg bg-[var(--color-primary)] text-white flex items-center justify-center font-mono text-sm shadow-xs ring-2 ring-[var(--color-primary-soft)] relative font-bold"
                  >
                    {idx + 1}
                    {isAns && (
                      <div className="absolute bottom-1 right-1 w-1.5 h-1.5 bg-[#3d8f6e] rounded-full" />
                    )}
                  </button>
                );
              }

              if (isAns) {
                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setCurrentIndex(idx)}
                    className="w-10 h-10 rounded-lg bg-[var(--color-primary-soft)]/60 border border-[var(--color-primary)]/40 text-[var(--color-primary-dark)] flex items-center justify-center font-mono text-sm hover:bg-[var(--color-primary-soft)] transition-colors relative font-semibold"
                  >
                    {idx + 1}
                    <div className="absolute bottom-1 right-1 w-1.5 h-1.5 bg-[#3d8f6e] rounded-full" />
                  </button>
                );
              }

              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => setCurrentIndex(idx)}
                  className="w-10 h-10 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-muted)] flex items-center justify-center font-mono text-sm hover:border-[var(--color-primary)]/40 hover:text-[var(--color-text)] transition-colors"
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>
        </div>

        {/* Fixed Legend Footer */}
        <div className="p-4 border-t border-[var(--color-border)] shrink-0 flex flex-col gap-2 bg-[var(--color-surface)]">
          <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
            <div className="w-2.5 h-2.5 bg-[#3d8f6e] rounded-full shrink-0" />
            <span>پاسخ داده شده ({answeredCount})</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
            <div className="w-2.5 h-2.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-full shrink-0" />
            <span>پاسخ داده نشده ({unansweredCount})</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
            <div className="w-2.5 h-2.5 bg-[var(--color-primary)] rounded-full ring-2 ring-[var(--color-primary-soft)] shrink-0" />
            <span>سوال فعلی</span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full min-w-0 max-w-full overflow-hidden">
        {/* TopAppBar inside Main Content Area */}
        <header className="shrink-0 bg-[var(--color-surface)] text-[var(--color-text)] border-b border-[var(--color-border)] shadow-xs flex justify-between items-center w-full px-4 md:px-6 py-2.5 z-10">
          <div className="flex items-center gap-3">
            <BrandLogo variant="logo-only" size="sm" />
            <div className="h-5 w-px bg-[var(--color-border)] mx-1 hidden md:block" />
            <ExamHierarchyHeader coverage={coverage} fallbackTopic={topicName} />
          </div>

          {/* Progress Center Bar */}
          <div className="flex flex-1 justify-center max-w-xs md:max-w-sm mx-4 hidden md:flex items-center gap-3">
            <span className="text-xs font-label-sm text-[var(--color-text-muted)] whitespace-nowrap">
              {formatPersianOf(currentIndex + 1, totalQuestions, { prefix: "سوال" })}
            </span>
            <div className="w-full bg-[var(--color-surface-warm)] border border-[var(--color-border)] rounded-full h-2 overflow-hidden">
              <div
                className="bg-[var(--color-primary)] h-full rounded-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Right Header Actions */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 bg-[var(--color-surface-warm)] border border-[var(--color-border)] px-2.5 py-1 rounded-lg text-[var(--color-text)] font-label-sm">
              <span className="material-symbols-outlined text-[16px]">timer</span>
              <span className="font-mono text-xs mt-0.5" dir="ltr">
                {formatTimer(elapsedSeconds)}
              </span>
            </div>

            <button
              type="button"
              onClick={onExit}
              title="خروج از آزمون"
              className="hidden md:flex text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors p-1.5 rounded-full hover:bg-[var(--color-surface-warm)]"
            >
              <span className="material-symbols-outlined text-[20px]">help_outline</span>
            </button>

            <button
              type="button"
              onClick={() => setShowConfirmModal(true)}
              className="bg-[var(--color-primary)] text-white px-3.5 py-1.5 rounded-lg text-xs md:text-sm hover:bg-[var(--color-primary-hover)] transition-colors hidden sm:block shadow-xs font-semibold"
            >
              پایان آزمون
            </button>
          </div>
        </header>

        {/* Scrollable Main Area */}
        <main className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 flex flex-col items-center justify-start min-h-0 w-full bg-[var(--color-bg-default)]">
          <div className="w-full max-w-3xl mx-auto flex flex-col gap-3 my-auto relative">
            {errorMsg && (
              <div className="bg-[#fde8e8] border border-[#e8a0a0] rounded-xl p-3 text-[#7f3131] text-xs flex items-center justify-between">
                <span>{errorMsg}</span>
                <button
                  type="button"
                  onClick={() => setErrorMsg(null)}
                  className="text-xs bg-[#b84c4c] px-2.5 py-1 rounded-lg text-white hover:bg-[#a13e3e]"
                >
                  متوجه شدم
                </button>
              </div>
            )}

            {/* Question Card */}
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5 md:p-6 shadow-xs relative w-full min-w-0">
              <div className="flex items-center justify-between gap-3 mb-3">
                <span className="bg-[var(--color-primary-soft)] text-[var(--color-primary-dark)] border border-[var(--color-primary)]/30 px-2.5 py-0.5 rounded-md text-xs font-semibold">
                  سوال {toPersianDigits(currentIndex + 1)}
                </span>

                {/* Controlled Source Disclosure Button */}
                {(currentQuestionTopic || displayTopic) && (
                  <div>
                    {!isSourceRevealed ? (
                      <button
                        type="button"
                        onClick={() => handleToggleSource(currentQuestion.id)}
                        className="flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors py-1 px-2.5 rounded-lg bg-[var(--color-surface-warm)] hover:bg-[var(--color-surface-warm)]/80 border border-[var(--color-border)]"
                        aria-expanded={false}
                      >
                        <span className="material-symbols-outlined text-[15px]">visibility</span>
                        <span>نمایش منبع سوال</span>
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="bg-[#f3e8ff] text-[#7c3aed] border border-[#d8b4fe] px-2.5 py-0.5 rounded-md text-xs font-medium">
                          منبع: {currentQuestionTopic || displayTopic}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleToggleSource(currentQuestion.id)}
                          className="flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors py-1 px-2 rounded-lg bg-[var(--color-surface-warm)] border border-[var(--color-border)]"
                          aria-expanded={true}
                        >
                          <span className="material-symbols-outlined text-[15px]">visibility_off</span>
                          <span>مخفی کردن</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="font-semibold text-[var(--color-text)] leading-relaxed text-base md:text-lg break-words min-w-0">
                <RichContent content={currentQuestion.question} />
              </div>
            </div>

            {/* Options Grid */}
            {currentQuestion.choices && currentQuestion.choices.length > 0 && (
              <div className="grid grid-cols-1 gap-2.5 w-full min-w-0">
                {currentQuestion.choices.map((choice, idx) => {
                  const isSelected = selectedAnswer === choice;
                  const optionLetter = String.fromCharCode(65 + idx); // A, B, C, D...

                  return (
                    <label
                      key={idx}
                      onClick={() => handleSelectChoice(choice)}
                      className={`option-card ${
                        isSelected
                          ? "active bg-[var(--color-primary-soft)]/50 border-[var(--color-primary)] shadow-xs"
                          : "bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[var(--color-primary)]/40 hover:bg-[var(--color-surface-warm)]/50"
                      } rounded-xl py-2.5 px-3.5 cursor-pointer transition-all duration-150 flex items-center gap-3 group relative w-full min-w-0`}
                    >
                      <div
                        className={`flex items-center justify-center w-7 h-7 rounded-full border font-mono text-xs shrink-0 transition-colors ${
                          isSelected
                            ? "bg-[var(--color-primary)] border-[var(--color-primary)] text-white font-bold"
                            : "border-[var(--color-border)] text-[var(--color-text-muted)] group-hover:border-[var(--color-primary)]/40 group-hover:text-[var(--color-text)]"
                        }`}
                      >
                        {optionLetter}
                      </div>
                      <div
                        className={`flex-1 ${
                          isSelected ? "text-[var(--color-text)] font-semibold" : "text-[var(--color-text-secondary)]"
                        } text-sm md:text-base leading-snug break-words min-w-0`}
                      >
                        <RichContent content={choice} inline />
                      </div>
                      <input
                        type="radio"
                        name={`question_${currentQuestion.id}`}
                        checked={isSelected}
                        onChange={() => {}}
                        className="hidden"
                      />
                    </label>
                  );
                })}
              </div>
            )}

            {/* Footer Actions */}
            <div className="mt-3 pt-3 border-t border-[var(--color-border)] flex justify-between items-center gap-3">
              <button
                type="button"
                onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
                disabled={currentIndex === 0 || isSubmitting}
                className="px-4 py-2 rounded-xl border border-[var(--color-border)] text-[var(--color-text-muted)] text-xs md:text-sm font-title-md hover:bg-[var(--color-surface-warm)] hover:text-[var(--color-text)] transition-colors flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:pointer-events-none"
              >
                <span className="material-symbols-outlined text-[18px]" dir="ltr">
                  arrow_forward
                </span>
                سوال قبلی
              </button>

              <button
                type="button"
                onClick={() => setShowAiMentor(true)}
                className="px-4 py-2 rounded-xl border border-[#d8b4fe] text-[#7c3aed] text-xs md:text-sm bg-[#f3e8ff]/60 hover:bg-[#f3e8ff] transition-colors flex items-center justify-center gap-1.5 shadow-xs font-semibold"
              >
                <span className="material-symbols-outlined text-[18px]">smart_toy</span>
                راهنمایی از منتور هوشمند
              </button>

              {isLastQuestion ? (
                <button
                  type="button"
                  onClick={() => setShowConfirmModal(true)}
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-[var(--color-primary)] text-white text-xs md:text-sm hover:bg-[var(--color-primary-hover)] transition-colors flex items-center justify-center gap-1.5 shadow-xs disabled:opacity-50 font-semibold"
                >
                  ثبت و پایان آزمون
                  <span className="material-symbols-outlined text-[18px]" dir="ltr">
                    check
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setCurrentIndex((prev) => Math.min(totalQuestions - 1, prev + 1))}
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-[var(--color-primary)] text-white text-xs md:text-sm font-title-md hover:bg-[var(--color-primary-hover)] transition-colors flex items-center justify-center gap-1.5 shadow-xs font-semibold"
                >
                  سوال بعدی
                  <span className="material-symbols-outlined text-[18px]" dir="ltr">
                    arrow_back
                  </span>
                </button>
              )}
            </div>
          </div>
        </main>
      </div>

      {/* Completion Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" id="completion-modal">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs"
            onClick={() => !isSubmitting && setShowConfirmModal(false)}
          />
          {/* Modal Card */}
          <div className="relative bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 max-w-md w-full shadow-modal flex flex-col items-center text-center z-10">
            <div className="w-14 h-14 bg-[var(--color-primary-soft)] text-[var(--color-primary)] rounded-full flex items-center justify-center mb-4">
              <span className="material-symbols-outlined text-3xl">task_alt</span>
            </div>
            <h2 className="text-h3 text-[var(--color-text)] mb-2">پایان آزمون</h2>
            <p className="text-[var(--color-text-muted)] text-sm mb-6">
              شما به <span className="text-[var(--color-text)] font-bold">{toPersianDigits(answeredCount)}</span> سوال از{" "}
              <span className="text-[var(--color-text)] font-bold">{toPersianDigits(totalQuestions)}</span> سوال پاسخ داده‌اید. آیا از ثبت نهایی اطمینان دارید؟
            </p>
            <div className="flex flex-col w-full gap-2.5">
              <button
                type="button"
                onClick={handleFinalSubmit}
                disabled={isSubmitting}
                className="w-full py-2.5 rounded-xl bg-[var(--color-primary)] text-white font-title-md text-sm hover:bg-[var(--color-primary-hover)] transition-all shadow-xs disabled:opacity-50 flex items-center justify-center gap-2 font-semibold"
              >
                {isSubmitting ? (
                  <span>در حال ثبت...</span>
                ) : (
                  <span>ثبت و مشاهده نتایج</span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                disabled={isSubmitting}
                className="w-full py-2.5 rounded-xl border border-[var(--color-border)] text-[var(--color-text-muted)] font-title-md text-sm hover:bg-[var(--color-surface-warm)] hover:text-[var(--color-text)] transition-all disabled:opacity-50"
              >
                بازگشت به آزمون
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Mentor Smart Hint Overlay */}
      {showAiMentor && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 md:p-8 bg-slate-900/60 backdrop-blur-xs" id="ai-mentor-overlay">
          <div className="max-w-xl w-full rounded-2xl overflow-hidden shadow-modal border border-[var(--color-border)] flex flex-col bg-[var(--color-surface)]">
            {/* Header */}
            <div className="bg-[var(--color-primary-soft)] p-5 flex items-center gap-3 border-b border-[var(--color-primary)]/20">
              <div className="w-9 h-9 rounded-xl bg-[var(--color-primary)] text-white flex items-center justify-center shrink-0 font-bold text-sm shadow-xs">
                AV
              </div>
              <div>
                <h2 className="text-h3 text-[var(--color-text)]">تحلیل هوشمند آوانا</h2>
                <p className="text-[var(--color-primary-dark)] text-xs font-medium">
                  راهنمای آموزشی سوال {toPersianDigits(currentIndex + 1)}
                </p>
              </div>
              <button
                type="button"
                className="mr-auto text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors p-1 rounded-lg hover:bg-[var(--color-surface-warm)]"
                onClick={() => setShowAiMentor(false)}
                aria-label="بستن"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>
            {/* Content */}
            <div className="p-5 md:p-6 overflow-y-auto max-h-[70vh] flex flex-col gap-4">
              <div className="flex flex-col gap-2.5">
                <h3 className="text-h4 text-[var(--color-primary-dark)] flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[18px]" aria-hidden="true">lightbulb</span>
                  <span>راهنمای مفهومی سوال:</span>
                </h3>
                <p className="text-[var(--color-text)] leading-relaxed text-sm md:text-base">
                  این سوال مربوط به مبحث <span className="text-[var(--color-primary)] font-bold">{currentQuestionTopic || displayTopic}</span> است. به تعاریف پایه، مکانیسم‌های دارویی/پاتوفیزیولوژی و تفاوت‌های اختصاصی هر گزینه با سایرین دقت فرمایید.
                </p>
                <div className="p-3 bg-[#e8f4fb] border border-[#a7d0e6] rounded-xl text-xs text-[#2b6d8f]">
                  <span>💡 تحلیل تفصیلی، پاسخ صحیح و منبع پس از ثبت نهایی آزمون در دسترس قرار خواهد گرفت.</span>
                </div>
              </div>

              {/* Key Point - rendered ONLY when real keyPoint data exists */}
              {questionKeyPoint ? (
                <div className="bg-[var(--color-surface-warm)] p-3.5 rounded-xl border border-[var(--color-border)]">
                  <h4 className="text-[var(--color-text)] font-bold text-sm mb-1.5 flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-sm text-[var(--color-primary)]" aria-hidden="true">info</span>
                    <span>نکته کلیدی:</span>
                  </h4>
                  <p className="text-xs md:text-sm text-[var(--color-text-muted)] leading-relaxed">
                    {questionKeyPoint}
                  </p>
                </div>
              ) : null}

              <div className="flex justify-end mt-2">
                <button
                  type="button"
                  className="bg-[var(--color-primary)] text-white px-5 py-2 rounded-lg font-title-md text-xs md:text-sm hover:bg-[var(--color-primary-hover)] transition-colors font-semibold shadow-xs"
                  onClick={() => setShowAiMentor(false)}
                >
                  متوجه شدم
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
