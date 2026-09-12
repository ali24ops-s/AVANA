import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Sparkles } from "lucide-react";
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
  extractCleanTitles,
} from "../../lib/utils/exam-title-formatter.js";
import { RichContent } from "../markdown/MarkdownRenderer.js";
import { StudyAssistantChat, type QuestionMentorState } from "../ai/StudyAssistantChat.js";

export interface ExamTakingViewProps {
  organizationId: string;
  attemptId: string;
  questions: Array<{
    id: string;
    quizId?: string;
    lessonId?: string | null;
    question: string;
    choices: string[] | null;
    topic?: string | null;
    difficulty?: string | null;
    questionType?: string;
    explanation?: string | null;
    keyPoint?: string | null;
    keyPoints?: string[] | null;
    lesson?: { id: string; title: string } | null;
    chapter?: { id: string; title: string } | null;
    course?: { id: string; title: string } | null;
  }>;
  initialAnswers?: Record<string, unknown>;
  startedAt?: string;
  initialElapsedSeconds?: number;
  timeLimitMinutes?: number | null;
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
  startedAt: _startedAt,
  initialElapsedSeconds,
  timeLimitMinutes,
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

  // Modals & mentor state
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
  const [isMentorOpen, setIsMentorOpen] = useState<boolean>(false);
  const mentorPopoverRef = useRef<HTMLDivElement | null>(null);
  const mentorButtonRef = useRef<HTMLButtonElement | null>(null);

  // In-memory persistent mentor conversation history per question during the current attempt
  const [mentorConversations, setMentorConversations] = useState<Record<string, QuestionMentorState>>({});

  const handleMentorConversationChange = useCallback(
    (newState: QuestionMentorState, targetQuestionId?: string) => {
      const qid = targetQuestionId || questions[currentIndex]?.id;
      if (!qid) return;
      setMentorConversations((prev) => ({
        ...prev,
        [qid]: newState,
      }));
    },
    [questions, currentIndex]
  );

  // Dismiss mentor popover on click outside or Escape key
  useEffect(() => {
    if (!isMentorOpen) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (mentorButtonRef.current?.contains(event.target as Node)) {
        return;
      }
      if (
        mentorPopoverRef.current &&
        !mentorPopoverRef.current.contains(event.target as Node)
      ) {
        setIsMentorOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMentorOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMentorOpen]);

  // Determine if exam has a time limit
  const hasTimeLimit = typeof timeLimitMinutes === "number" && timeLimitMinutes > 0;
  const totalTimeLimitSeconds = hasTimeLimit ? timeLimitMinutes * 60 : 0;

  // Resolve initial active elapsed seconds (monotonically merging server and localStorage)
  const getInitialElapsedSeconds = (): number => {
    let localSeconds = 0;
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        const stored = window.localStorage.getItem(`avana_exam_elapsed_${attemptId}`);
        if (stored) {
          const parsed = parseInt(stored, 10);
          if (!isNaN(parsed) && parsed >= 0) {
            localSeconds = parsed;
          }
        }
      } catch {
        // Ignore localStorage read errors
      }
    }
    const serverSeconds =
      typeof initialElapsedSeconds === "number" && initialElapsedSeconds >= 0
        ? initialElapsedSeconds
        : 0;

    return Math.max(serverSeconds, localSeconds);
  };

  // Base accumulated active seconds from previously closed active slices
  const baseElapsedSecondsRef = useRef<number>(getInitialElapsedSeconds());
  // Active slice start timestamp (null when tab is hidden, inactive, or unmounted)
  const activeSessionStartMsRef = useRef<number | null>(
    typeof document !== "undefined" && document.visibilityState === "visible" ? Date.now() : null
  );

  // Synchronous localStorage persistence helper
  const persistLocally = useCallback((sec: number) => {
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        const currentStored = parseInt(
          window.localStorage.getItem(`avana_exam_elapsed_${attemptId}`) || "0",
          10
        );
        const maxSec = Math.max(isNaN(currentStored) ? 0 : currentStored, sec);
        window.localStorage.setItem(`avana_exam_elapsed_${attemptId}`, String(maxSec));
      } catch {
        // Ignore localStorage write errors
      }
    }
  }, [attemptId]);

  // Get current active elapsed seconds at this exact instant (timestamp-based to prevent setInterval throttling drift)
  const getActiveElapsedSeconds = useCallback((): number => {
    if (activeSessionStartMsRef.current !== null) {
      const now = Date.now();
      const sliceSeconds = Math.max(0, Math.floor((now - activeSessionStartMsRef.current) / 1000));
      return baseElapsedSecondsRef.current + sliceSeconds;
    }
    return baseElapsedSecondsRef.current;
  }, []);

  // Close the active slice idempotently and return the total accumulated seconds
  const closeActiveSlice = useCallback((): number => {
    if (activeSessionStartMsRef.current !== null) {
      const now = Date.now();
      const sliceSeconds = Math.max(0, Math.floor((now - activeSessionStartMsRef.current) / 1000));
      baseElapsedSecondsRef.current += sliceSeconds;
      activeSessionStartMsRef.current = null;
    }
    const total = baseElapsedSecondsRef.current;
    persistLocally(total);
    return total;
  }, [persistLocally]);

  // Start active slice idempotently when document is visible
  const startActiveSlice = useCallback(() => {
    if (
      typeof document !== "undefined" &&
      document.visibilityState === "visible" &&
      activeSessionStartMsRef.current === null
    ) {
      activeSessionStartMsRef.current = Date.now();
    }
  }, []);

  const [elapsedSeconds, setElapsedSeconds] = useState<number>(() => {
    const initial = baseElapsedSecondsRef.current;
    persistLocally(initial);
    return initial;
  });

  const hasAutoSubmittedRef = useRef<boolean>(false);

  const handleExitClick = useCallback(() => {
    const total = closeActiveSlice();
    void studyApi
      .saveExamAnswers(organizationId, attemptId, {
        answers: [],
        elapsedSeconds: total,
      })
      .catch(() => {});
    onExit();
  }, [closeActiveSlice, onExit, organizationId, attemptId, studyApi]);

  const handleFinalSubmit = useCallback(async () => {
    setErrorMsg(null);
    setIsSubmitting(true);
    const finalElapsed = closeActiveSlice();

    try {
      const formattedAnswers = questions.map((q) => ({
        questionId: q.id,
        answer: answers[q.id] ?? null,
      }));

      const res = await studyApi.submitExamAttempt(organizationId, attemptId, {
        answers: formattedAnswers,
        elapsedSeconds: finalElapsed,
      });

      // Clear local storage after successful submit
      if (typeof window !== "undefined" && window.localStorage) {
        try {
          window.localStorage.removeItem(`avana_exam_elapsed_${attemptId}`);
        } catch {
          // Ignore removal error
        }
      }

      setShowConfirmModal(false);
      onSubmitSuccess(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : undefined;
      setErrorMsg(msg || "خطا در ثبت نتیجه آزمون. لطفاً دوباره تلاش کنید.");
      setIsSubmitting(false);
      startActiveSlice(); // Resume timer if submit failed
    }
  }, [
    answers,
    attemptId,
    closeActiveSlice,
    onSubmitSuccess,
    organizationId,
    questions,
    startActiveSlice,
    studyApi,
  ]);

  // Active presence tracking & UI update loop
  useEffect(() => {
    startActiveSlice();

    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        const current = getActiveElapsedSeconds();
        setElapsedSeconds(current);
        persistLocally(current);

        // Auto-submit only when active presence actually hits time limit
        if (
          hasTimeLimit &&
          totalTimeLimitSeconds > 0 &&
          current >= totalTimeLimitSeconds &&
          !hasAutoSubmittedRef.current &&
          !isSubmitting
        ) {
          hasAutoSubmittedRef.current = true;
          void handleFinalSubmit();
        }
      }
    }, 1000);

    // Visibility change handler: close slice on hidden, resume on visible
    const handleVisibilityChange = () => {
      if (typeof document === "undefined") return;
      if (document.visibilityState === "hidden") {
        const total = closeActiveSlice();
        setElapsedSeconds(total);
      } else if (document.visibilityState === "visible") {
        startActiveSlice();
        setElapsedSeconds(getActiveElapsedSeconds());
      }
    };

    // Page hide / beforeunload: synchronously close slice and persist
    const handlePageHide = () => {
      const total = closeActiveSlice();
      if (typeof navigator !== "undefined" && navigator.sendBeacon) {
        try {
          const url = `${getApiBaseUrl()}/v1/organizations/${organizationId}/study/exams/attempts/${attemptId}/answers`;
          const blob = new Blob(
            [JSON.stringify({ answers: [], elapsedSeconds: total })],
            { type: "application/json" }
          );
          navigator.sendBeacon(url, blob);
        } catch {
          // Ignore sendBeacon errors
        }
      }
    };

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }
    if (typeof window !== "undefined") {
      window.addEventListener("pagehide", handlePageHide);
      window.addEventListener("beforeunload", handlePageHide);
    }

    return () => {
      clearInterval(interval);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
      if (typeof window !== "undefined") {
        window.removeEventListener("pagehide", handlePageHide);
        window.removeEventListener("beforeunload", handlePageHide);
      }

      // Synchronously close active slice and persist on unmount
      const total = closeActiveSlice();
      void studyApi
        .saveExamAnswers(organizationId, attemptId, {
          answers: [],
          elapsedSeconds: total,
        })
        .catch(() => {});
    };
  }, [
    attemptId,
    organizationId,
    hasTimeLimit,
    totalTimeLimitSeconds,
    isSubmitting,
    startActiveSlice,
    closeActiveSlice,
    getActiveElapsedSeconds,
    persistLocally,
    handleFinalSubmit,
    studyApi,
  ]);

  // Periodic server sync loop every 15s while active
  useEffect(() => {
    const syncInterval = setInterval(() => {
      if (
        typeof document !== "undefined" &&
        document.visibilityState === "visible" &&
        !isSubmitting
      ) {
        const current = getActiveElapsedSeconds();
        void studyApi
          .saveExamAnswers(organizationId, attemptId, {
            answers: [],
            elapsedSeconds: current,
          })
          .catch(() => {});
      }
    }, 15000);

    return () => clearInterval(syncInterval);
  }, [attemptId, organizationId, isSubmitting, getActiveElapsedSeconds, studyApi]);

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
            onClick={handleExitClick}
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

  // Format timer HH:MM:SS or MM:SS
  const formatTimer = (totalSec: number) => {
    const hours = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    if (hours > 0) {
      return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const displayTimeSeconds = hasTimeLimit
    ? Math.max(0, totalTimeLimitSeconds - elapsedSeconds)
    : elapsedSeconds;

  const handleSelectChoice = async (choice: string) => {
    if (isSubmitting) return;

    // Optimistic UI update
    const updatedAnswers = { ...answers, [currentQuestion.id]: choice };
    setAnswers(updatedAnswers);

    const currentElapsed = getActiveElapsedSeconds();
    persistLocally(currentElapsed);

    // Save answer and elapsed seconds to backend asynchronously
    try {
      await studyApi.saveExamAnswers(organizationId, attemptId, {
        answers: [{ questionId: currentQuestion.id, answer: choice }],
        elapsedSeconds: currentElapsed,
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

  // Question source text computation:
  // 1. If question has real lesson title, show chapter + lesson (or lesson alone)
  // 2. If question has sanitized topic or topicName, fallback to that topic
  // 3. Otherwise fallback to "درس نامشخص"
  const questionSourceText = useMemo(() => {
    if (currentQuestion?.lesson?.title) {
      if (currentQuestion.chapter?.title) {
        return `${currentQuestion.chapter.title} — ${currentQuestion.lesson.title}`;
      }
      return currentQuestion.lesson.title;
    }
    if (currentQuestionTopic) {
      return currentQuestionTopic;
    }
    if (topicName && !isInternalIdentifier(topicName)) {
      const cleanTitles = extractCleanTitles(topicName);
      if (cleanTitles.length > 0) {
        return cleanTitles.join("، ");
      }
    }
    return "درس نامشخص";
  }, [currentQuestion, currentQuestionTopic, topicName]);

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

  // Determine if the exam scope covers multiple chapters/modules
  const isMultiChapterExam = useMemo(() => {
    // 1. If coverage is present, check count of modules with questions
    if (coverage && coverage.length > 0) {
      let totalModules = 0;
      for (const c of coverage) {
        if (c.modules) {
          totalModules += c.modules.filter((m) => m.questionCount > 0).length;
        }
      }
      if (totalModules > 1) return true;
      if (totalModules === 1) return false;
    }

    // 2. Fall back to unique chapters among questions in this exam
    const uniqueChapters = new Set<string>();
    for (const q of questions) {
      const ch = q.chapter?.id || q.chapter?.title;
      if (ch && typeof ch === "string" && ch.trim() && !isInternalIdentifier(ch.trim())) {
        uniqueChapters.add(ch.trim());
      }
    }
    return uniqueChapters.size > 1;
  }, [coverage, questions]);

  // Real chapter title for current question if available
  const currentQuestionChapterTitle = useMemo(() => {
    const raw = currentQuestion?.chapter?.title;
    if (!raw || typeof raw !== "string" || !raw.trim() || isInternalIdentifier(raw.trim())) {
      return null;
    }
    const trimmed = raw.trim();
    return trimmed.startsWith("فصل") ? trimmed : `فصل ${trimmed}`;
  }, [currentQuestion]);

  // Real lesson title for current question
  const currentQuestionLessonTitle = useMemo(() => {
    if (currentQuestion?.lesson?.title) {
      return currentQuestion.lesson.title;
    }
    const lid = currentQuestion?.lessonId || currentQuestion?.lesson?.id;
    if (lid) {
      return currentQuestionTopic || displayTopic || null;
    }
    return null;
  }, [currentQuestion, currentQuestionTopic, displayTopic]);

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
            <div className="h-5 w-px bg-[var(--color-border)] mx-1 hidden sm:block" />
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
                {formatTimer(displayTimeSeconds)}
              </span>
            </div>

            <button
              type="button"
              onClick={handleExitClick}
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
                {currentQuestion && (
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
                          منبع: {questionSourceText}
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

              {/* Mentor CTA Button */}
              <button
                ref={mentorButtonRef}
                type="button"
                onClick={() => setIsMentorOpen((prev) => !prev)}
                className={`px-4 py-2 rounded-xl border text-xs md:text-sm transition-colors flex items-center justify-center gap-1.5 shadow-xs font-semibold ${
                  isMentorOpen
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-[#d8b4fe] text-[#7c3aed] bg-[#f3e8ff]/60 hover:bg-[#f3e8ff]"
                }`}
                aria-expanded={isMentorOpen}
                aria-haspopup="dialog"
              >
                <Sparkles className="w-4 h-4" />
                {isMentorOpen ? "بستن راهنمایی" : "راهنمایی از منتور هوشمند"}
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

      {/* Educational Mentor Popup with Soft Backdrop Blur */}
      {isMentorOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4 md:p-6 animate-in fade-in duration-200">
          {/* Gentle translucent backdrop with soft blur */}
          <div
            className="fixed inset-0 bg-slate-900/20 dark:bg-black/35 backdrop-blur-sm transition-opacity"
            onClick={() => setIsMentorOpen(false)}
            aria-hidden="true"
          />

          {/* Educational Popup Card */}
          <div
            ref={mentorPopoverRef}
            className="relative z-10 w-full sm:w-[560px] md:w-[580px] lg:w-[600px] max-w-[95vw] h-[82vh] sm:h-[650px] max-h-[85vh] rounded-2xl shadow-modal border border-[var(--color-border)] bg-[var(--color-surface)] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
            role="dialog"
            aria-label="راهنمای منتور هوشمند"
          >
            <StudyAssistantChat
              contextType="exam_question"
              examQuestion={{
                questionId: currentQuestion.id,
                questionNumber: currentIndex + 1,
                questionText: currentQuestion.question,
                choices: currentQuestion.choices,
                selectedChoice:
                  selectedAnswer !== undefined && selectedAnswer !== null
                    ? String(selectedAnswer)
                    : null,
                topic: currentQuestionTopic || displayTopic || null,
                keyPoint: questionKeyPoint || null,
                lessonId: currentQuestion.lessonId || currentQuestion.lesson?.id || null,
                lessonTitle: currentQuestionLessonTitle,
                chapterTitle: currentQuestionChapterTitle,
                isMultiChapterExam,
              }}
              conversationState={mentorConversations[currentQuestion.id]}
              onConversationStateChange={handleMentorConversationChange}
              autoStartGuidance={!mentorConversations[currentQuestion.id]}
              onClose={() => setIsMentorOpen(false)}
              className="h-full w-full border-none shadow-none rounded-none flex-1 min-h-0"
            />
          </div>
        </div>
      )}

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
    </div>
  );
}
