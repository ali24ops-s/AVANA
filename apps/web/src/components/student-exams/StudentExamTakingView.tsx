/**
 * StudentExamTakingView.
 *
 * Full-featured, race-safe, server-authoritative exam taking interface:
 *  - Server-authoritative timer driven strictly by deadlineAt
 *  - 60-second grace period handling
 *  - Serialized, race-safe autosave queue (A -> B -> C guarantees C on server)
 *  - Submit-after-save guarantee (flushes pending autosaves before submitting)
 *  - Double-submit prevention
 *  - Question navigation with answered/unanswered tracking
 *  - Mobile-first, responsive, clean RTL Estedad design
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Button,
  Card,
  Dialog,
  DialogHeader,
  DialogContent,
  DialogFooter,
  Alert,
} from "../ui/index.js";
import {
  type StudentAttemptDTO,
  type StudentAttemptResultDTO,
} from "../../lib/api/student-platform.js";
import { useQueryClient } from "@tanstack/react-query";
import {
  useSaveStudentExamAnswer,
  useSubmitStudentExamAttempt,
  studentExamKeys,
} from "../../hooks/useStudentTeacherExams.js";
import {
  toPersianDigits,
  computePerQuestionTiming,
  countWords,
  RAPID_INPUT_CONFIG,
  type DescriptiveAnswerIntegrityData,
  type DescriptivePasteEvent,
  type DescriptiveRapidInputEvent,
  type DescriptiveTimelineEvent,
} from "@avana/domain";
import { RichContent } from "../markdown/MarkdownRenderer.js";
import { ApiError } from "../../lib/api/errors.js";
import {
  Clock,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  Send,
  Loader2,
  LogOut,
  RefreshCw,
  Check,
} from "lucide-react";

export interface StudentExamTakingViewProps {
  examId: string;
  classroomId: string;
  examTitle: string;
  attempt: StudentAttemptDTO;
  onExit: () => void;
  onSubmitSuccess: (result: StudentAttemptResultDTO) => void;
}

const OPTION_LABELS = ["الف", "ب", "ج", "د", "هـ", "و"];
const GRACE_PERIOD_MS = 60_000;

export function StudentExamTakingView({
  examId,
  classroomId,
  examTitle,
  attempt,
  onExit,
  onSubmitSuccess,
}: StudentExamTakingViewProps) {
  const navigate = useNavigate();

  // ---------------------------------------------------------------------------
  // Per-Question Timing & Answer State
  // ---------------------------------------------------------------------------
  const isPerQuestionTiming = Boolean(
    attempt.perQuestionTimeSeconds && attempt.perQuestionTimeSeconds > 0,
  );

  // Track finalized status & timestamps for each question
  const [finalizedMap, setFinalizedMap] = useState<
    Record<
      string,
      {
        answeredAt?: string | null;
        finalizedAt?: string | null;
        selectedOptionId?: string | null;
      }
    >
  >(() => {
    const map: Record<
      string,
      {
        answeredAt?: string | null;
        finalizedAt?: string | null;
        selectedOptionId?: string | null;
      }
    > = {};
    if (attempt.savedAnswers) {
      for (const sa of attempt.savedAnswers) {
        map[sa.questionId] = {
          answeredAt: sa.answeredAt ?? null,
          finalizedAt: sa.finalizedAt ?? null,
          selectedOptionId: sa.selectedOptionId ?? null,
        };
      }
    }
    return map;
  });

  // Initialize answers from server attempt snapshot
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    if (attempt.savedAnswers) {
      for (const sa of attempt.savedAnswers) {
        if (sa.selectedOptionId) {
          map[sa.questionId] = sa.selectedOptionId;
        }
      }
    }
    return map;
  });

  // Initialize text answers for descriptive questions
  const [textAnswers, setTextAnswers] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    if (attempt.savedAnswers) {
      for (const sa of attempt.savedAnswers) {
        if (sa.textAnswer) {
          map[sa.questionId] = sa.textAnswer;
        }
      }
    }
    return map;
  });

  // Initialize statement answers for multi-statement true_false questions
  const [statementAnswers, setStatementAnswers] = useState<Record<string, Record<string, boolean>>>(() => {
    const map: Record<string, Record<string, boolean>> = {};
    if (attempt.savedAnswers) {
      for (const sa of attempt.savedAnswers) {
        if (sa.textAnswer) {
          try {
            const parsed = JSON.parse(sa.textAnswer);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
              map[sa.questionId] = parsed;
            }
          } catch {
            // not json
          }
        }
      }
    }
    return map;
  });

  // Server-Authoritative Timer & Clock
  const deadlineMs = useMemo(() => new Date(attempt.deadlineAt).getTime(), [attempt.deadlineAt]);
  const [nowMs, setNowMs] = useState<number>(Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Compute per-question timing dynamically from server-authoritative timestamps
  const timingInfo = useMemo(() => {
    if (!isPerQuestionTiming) return null;
    const questions = attempt.questions || [];
    const savedAnswersArray = questions.map((q) => {
      const saved = finalizedMap[q.id];
      return {
        questionId: q.id,
        answeredAt: saved?.answeredAt ?? (selectedAnswers[q.id] ? attempt.startedAt : null),
        finalizedAt: saved?.finalizedAt ?? null,
        selectedOptionId: saved?.selectedOptionId ?? selectedAnswers[q.id] ?? null,
      };
    });
    return computePerQuestionTiming({
      startedAt: attempt.startedAt,
      deadlineAt: attempt.deadlineAt,
      perQuestionTimeSeconds: attempt.perQuestionTimeSeconds,
      questions,
      savedAnswers: savedAnswersArray,
      now: nowMs,
    });
  }, [
    isPerQuestionTiming,
    attempt.perQuestionTimeSeconds,
    attempt.startedAt,
    attempt.deadlineAt,
    attempt.questions,
    finalizedMap,
    selectedAnswers,
    nowMs,
  ]);

  const [currentIndex, setCurrentIndexState] = useState<number>(() => {
    const questions = attempt.questions || [];
    if (attempt.perQuestionTimeSeconds && attempt.perQuestionTimeSeconds > 0) {
      const info = computePerQuestionTiming({
        startedAt: attempt.startedAt,
        deadlineAt: attempt.deadlineAt,
        perQuestionTimeSeconds: attempt.perQuestionTimeSeconds,
        questions,
        savedAnswers: attempt.savedAnswers || [],
        now: Date.now(),
      });
      return info ? info.currentIndex : 0;
    }
    // Jump to first unanswered question if resuming non-timed exam
    if (attempt.savedAnswers && attempt.savedAnswers.length > 0) {
      const answeredSet = new Set(
        attempt.savedAnswers.filter((a) => a.selectedOptionId).map((a) => a.questionId),
      );
      const firstUnanswered = questions.findIndex((q) => !answeredSet.has(q.id));
      if (firstUnanswered >= 0) return firstUnanswered;
      return !attempt.allowBackNavigation ? Math.max(0, questions.length - 1) : 0;
    }
    return 0;
  });

  const goToIndex = useCallback(
    (target: number | ((prev: number) => number)) => {
      setCurrentIndexState((prev) => {
        const next = typeof target === "function" ? target(prev) : target;
        const total = attempt.questions?.length ?? 0;
        const clamped = Math.max(0, Math.min(total - 1, next));
        if ((!attempt.allowBackNavigation || isPerQuestionTiming) && clamped < prev) {
          return prev;
        }
        return clamped;
      });
    },
    [attempt.allowBackNavigation, isPerQuestionTiming, attempt.questions?.length],
  );

  // Sync index if timing info authoritative index moves ahead
  useEffect(() => {
    if (isPerQuestionTiming && timingInfo) {
      if (timingInfo.currentIndex > currentIndex) {
        setCurrentIndexState(timingInfo.currentIndex);
      }
    }
  }, [isPerQuestionTiming, timingInfo?.currentIndex, currentIndex]);

  // ---------------------------------------------------------------------------
  // Modals & Submission State
  // ---------------------------------------------------------------------------
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false);
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ---------------------------------------------------------------------------
  // Question Active Timing (Monotonic Clock) & Render Readiness
  // ---------------------------------------------------------------------------
  const [isQuestionReady, setIsQuestionReady] = useState<boolean>(false);
  const [tabSwitchAlert, setTabSwitchAlert] = useState<boolean>(false);

  // Accumulated active duration in ms per question: questionId -> totalMs
  const questionActiveDurationsRef = useRef<Map<string, number>>(new Map());
  // Monotonic performance timestamp when current active slice began
  const activeSliceStartPerfRef = useRef<number | null>(null);
  // Question ID associated with the current running active slice
  const activeSliceQuestionIdRef = useRef<string | null>(null);

  // Tab switch count and security tracking
  const tabSwitchesCountRef = useRef<number>(0);
  const questionTabSwitchesRef = useRef<Map<string, number>>(new Map());

  // Close active slice and commit elapsed duration idempotently
  const stopQuestionActiveSlice = useCallback(() => {
    if (activeSliceStartPerfRef.current !== null && activeSliceQuestionIdRef.current) {
      const elapsed = Math.max(0, performance.now() - activeSliceStartPerfRef.current);
      const qId = activeSliceQuestionIdRef.current;
      const prev = questionActiveDurationsRef.current.get(qId) || 0;
      questionActiveDurationsRef.current.set(qId, prev + elapsed);
      activeSliceStartPerfRef.current = null;
      activeSliceQuestionIdRef.current = null;
    }
  }, []);

  // Start active slice for the given question (only if tab is visible)
  const startQuestionActiveSlice = useCallback(
    (targetQId?: string) => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }
      const questionsList = attempt.questions || [];
      const currentQ = targetQId ? { id: targetQId } : questionsList[currentIndex];
      if (!currentQ) return;

      // Already active for this question
      if (
        activeSliceQuestionIdRef.current === currentQ.id &&
        activeSliceStartPerfRef.current !== null
      ) {
        return;
      }

      // If another question slice is running, stop it
      if (activeSliceStartPerfRef.current !== null) {
        stopQuestionActiveSlice();
      }

      activeSliceStartPerfRef.current = performance.now();
      activeSliceQuestionIdRef.current = currentQ.id;
    },
    [attempt.questions, currentIndex, stopQuestionActiveSlice],
  );

  // Get live active duration in ms for a question
  const getQuestionActiveDurationMs = useCallback((qId: string): number => {
    let total = questionActiveDurationsRef.current.get(qId) || 0;
    if (
      activeSliceQuestionIdRef.current === qId &&
      activeSliceStartPerfRef.current !== null
    ) {
      total += Math.max(0, performance.now() - activeSliceStartPerfRef.current);
    }
    return Math.round(total);
  }, []);

  const currentQuestionForReadiness = (attempt.questions || [])[currentIndex];

  // Lifecycle: Question Selected -> Render -> Readiness Confirmation via requestAnimationFrame -> Active Timer Start
  useEffect(() => {
    setIsQuestionReady(false);
    let isCancelled = false;

    // Start active slice immediately if tab is visible
    if (typeof document !== "undefined" && document.visibilityState === "visible") {
      startQuestionActiveSlice(currentQuestionForReadiness?.id);
    }

    // Confirm UI readiness via requestAnimationFrame
    const frame = requestAnimationFrame(() => {
      if (!isCancelled) {
        setIsQuestionReady(true);
      }
    });

    return () => {
      isCancelled = true;
      cancelAnimationFrame(frame);
      stopQuestionActiveSlice();
    };
  }, [currentIndex, currentQuestionForReadiness?.id, startQuestionActiveSlice, stopQuestionActiveSlice]);

  // Tab Visibility Security Listener
  useEffect(() => {
    if (typeof document === "undefined") return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        // Pause active timer slice and record tab switch violation
        stopQuestionActiveSlice();
        tabSwitchesCountRef.current++;
        if (currentQuestionForReadiness) {
          const prev = questionTabSwitchesRef.current.get(currentQuestionForReadiness.id) || 0;
          questionTabSwitchesRef.current.set(currentQuestionForReadiness.id, prev + 1);
        }
        setTabSwitchAlert(true);
      } else if (document.visibilityState === "visible") {
        // Resume active slice if within exam deadline
        if (
          currentQuestionForReadiness &&
          Date.now() <= deadlineMs &&
          !isSubmitting
        ) {
          startQuestionActiveSlice(currentQuestionForReadiness.id);
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [
    currentQuestionForReadiness,
    deadlineMs,
    isSubmitting,
    startQuestionActiveSlice,
    stopQuestionActiveSlice,
  ]);

  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // Autosave Queue Management (Race-Safe)
  // ---------------------------------------------------------------------------
  const queryClient = useQueryClient();
  // pendingQueue stores desired selectedOptionId for questionId
  const pendingQueueRef = useRef<Map<string, string | null>>(new Map());
  const pendingTextQueueRef = useRef<Map<string, string>>(new Map());
  const pendingBooleanQueueRef = useRef<Map<string, Record<string, boolean>>>(new Map());
  const activeSavingRef = useRef<Set<string>>(new Set());
  const activeSavingPromisesRef = useRef<Map<string, Promise<boolean>>>(new Map());
  const saveSequenceRef = useRef<Map<string, number>>(new Map());
  const lastSaveErrorRef = useRef<Error | null>(null);
  const failedQuestionsRef = useRef<Set<string>>(new Set());
  const [savingStatus, setSavingStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Descriptive Answer Integrity & Telemetry Tracker
  // ---------------------------------------------------------------------------
  const integrityTrackersRef = useRef<
    Map<
      string,
      {
        startedAt: string | null;
        lastEditedAt: string | null;
        editCount: number;
        pasteCount: number;
        pastedCharactersTotal: number;
        pastedWordsTotal: number;
        rapidInputCount: number;
        rapidInputCharactersTotal: number;
        rapidInputWordsTotal: number;
        pasteEvents: DescriptivePasteEvent[];
        rapidInputEvents: DescriptiveRapidInputEvent[];
        timeline: DescriptiveTimelineEvent[];
        lastTextSnapshot: string;
        lastTextSnapshotTime: number;
        typingBatchActive: boolean;
        typingBatchTimer: NodeJS.Timeout | null;
        justPastedAt: number;
      }
    >
  >(new Map());

  const getOrCreateIntegrityTracker = useCallback((qId: string, initialText: string = "") => {
    let tracker = integrityTrackersRef.current.get(qId);
    if (!tracker) {
      tracker = {
        startedAt: initialText ? attempt.startedAt : null,
        lastEditedAt: null,
        editCount: initialText ? 1 : 0,
        pasteCount: 0,
        pastedCharactersTotal: 0,
        pastedWordsTotal: 0,
        rapidInputCount: 0,
        rapidInputCharactersTotal: 0,
        rapidInputWordsTotal: 0,
        pasteEvents: [],
        rapidInputEvents: [],
        timeline: initialText ? [{ type: "start", timestamp: attempt.startedAt }] : [],
        lastTextSnapshot: initialText,
        lastTextSnapshotTime: Date.now(),
        typingBatchActive: false,
        typingBatchTimer: null,
        justPastedAt: 0,
      };
      integrityTrackersRef.current.set(qId, tracker);
    }
    return tracker;
  }, [attempt.startedAt]);

  const recordPaste = useCallback((questionId: string, charCount: number, wordCount: number, cursorPos?: number | null) => {
    if (Date.now() > deadlineMs || isSubmitting) return;
    const tracker = getOrCreateIntegrityTracker(questionId, textAnswers[questionId] || "");
    const nowIso = new Date().toISOString();

    if (!tracker.startedAt) {
      tracker.startedAt = nowIso;
      tracker.timeline.push({ type: "start", timestamp: nowIso });
    }
    tracker.lastEditedAt = nowIso;
    tracker.pasteCount += 1;
    tracker.pastedCharactersTotal += charCount;
    tracker.pastedWordsTotal += wordCount;
    tracker.justPastedAt = Date.now();

    if (tracker.pasteEvents.length < 100) {
      tracker.pasteEvents.push({
        timestamp: nowIso,
        characterCount: charCount,
        wordCount,
        cursorPosition: cursorPos ?? null,
      });
    }

    if (tracker.timeline.length < 150) {
      tracker.timeline.push({
        type: "paste",
        timestamp: nowIso,
        characterDelta: charCount,
        wordDelta: wordCount,
        metadata: { chars: charCount, words: wordCount },
      });
    }
  }, [deadlineMs, getOrCreateIntegrityTracker, isSubmitting, textAnswers]);

  const handlePaste = useCallback((questionId: string, e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    try {
      const text = e.clipboardData?.getData("text/plain") || "";
      const charCount = text.length;
      if (charCount > 0) {
        const wordCount = countWords(text);
        const target = e.target as HTMLTextAreaElement;
        const cursorPos = typeof target?.selectionStart === "number" ? target.selectionStart : null;
        recordPaste(questionId, charCount, wordCount, cursorPos);
      }
    } catch {
      // Graceful fallback if clipboard API is restricted
    }
  }, [recordPaste]);

  useEffect(() => {
    return () => {
      for (const tracker of integrityTrackersRef.current.values()) {
        if (tracker.typingBatchTimer) {
          clearTimeout(tracker.typingBatchTimer);
        }
      }
    };
  }, []);

  const saveMutation = useSaveStudentExamAnswer(examId);
  const submitMutation = useSubmitStudentExamAttempt(examId, classroomId);

  const remainingMs = Math.max(0, deadlineMs - nowMs);
  const isPastDeadline = nowMs > deadlineMs;
  const isPastGrace = nowMs > deadlineMs + GRACE_PERIOD_MS;
  const graceRemainingMs = isPastDeadline
    ? Math.max(0, deadlineMs + GRACE_PERIOD_MS - nowMs)
    : GRACE_PERIOD_MS;

  const remainingSeconds = Math.floor(remainingMs / 1000);
  const graceRemainingSeconds = Math.floor(graceRemainingMs / 1000);

  // Format countdown mm:ss
  const formatTime = (totalSec: number) => {
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${toPersianDigits(String(m).padStart(2, "0"))}:${toPersianDigits(
      String(s).padStart(2, "0"),
    )}`;
  };

  // ---------------------------------------------------------------------------
  // Process Save Queue Worker
  // ---------------------------------------------------------------------------
  const processQueueForQuestion = useCallback(
    async (qId: string): Promise<boolean> => {
      const existingPromise = activeSavingPromisesRef.current.get(qId);
      if (existingPromise) {
        // In-flight request for this question already running, wait for it
        return existingPromise;
      }

      if (Date.now() > deadlineMs) {
        // Strictly forbid sending save requests once deadline passes
        pendingQueueRef.current.delete(qId);
        pendingTextQueueRef.current.delete(qId);
        pendingBooleanQueueRef.current.delete(qId);
        failedQuestionsRef.current.delete(qId);
        return false;
      }

      const desiredOptionId = pendingQueueRef.current.get(qId);
      const desiredText = pendingTextQueueRef.current.get(qId);
      const desiredBoolean = pendingBooleanQueueRef.current.get(qId);
      if (desiredOptionId === undefined && desiredText === undefined && desiredBoolean === undefined) return true;

      const seq = (saveSequenceRef.current.get(qId) || 0) + 1;
      saveSequenceRef.current.set(qId, seq);

      activeSavingRef.current.add(qId);
      setSavingStatus("saving");
      setSaveErrorMessage(null);

      const runSave = async (): Promise<boolean> => {
        const currentActiveMs = getQuestionActiveDurationMs(qId);
        const currentTabSwitches = questionTabSwitchesRef.current.get(qId) || 0;
        const tracker = integrityTrackersRef.current.get(qId);
        const integrityData: DescriptiveAnswerIntegrityData | undefined = tracker
          ? {
              startedAt: tracker.startedAt,
              lastEditedAt: tracker.lastEditedAt,
              durationMs: currentActiveMs,
              editCount: tracker.editCount,
              pasteCount: tracker.pasteCount,
              pastedCharactersTotal: tracker.pastedCharactersTotal,
              pastedWordsTotal: tracker.pastedWordsTotal,
              rapidInputCount: tracker.rapidInputCount,
              rapidInputCharactersTotal: tracker.rapidInputCharactersTotal,
              rapidInputWordsTotal: tracker.rapidInputWordsTotal,
              pasteEvents: tracker.pasteEvents.length > 0 ? tracker.pasteEvents : undefined,
              rapidInputEvents: tracker.rapidInputEvents.length > 0 ? tracker.rapidInputEvents : undefined,
              timeline: tracker.timeline.length > 0 ? tracker.timeline : undefined,
            }
          : undefined;

        const payloadToSave = {
          questionId: qId,
          selectedOptionId: desiredOptionId !== undefined ? desiredOptionId : null,
          textAnswer: desiredText !== undefined ? desiredText : desiredBoolean !== undefined ? JSON.stringify(desiredBoolean) : undefined,
          booleanAnswers: desiredBoolean !== undefined ? desiredBoolean : undefined,
          activeDurationMs: currentActiveMs,
          tabSwitchesCount: currentTabSwitches,
          integrityData,
        };

        try {
          await saveMutation.mutateAsync(payloadToSave);

          // Check if user updated option or text while request was in-flight
          if (pendingQueueRef.current.get(qId) === desiredOptionId) {
            pendingQueueRef.current.delete(qId);
          }
          if (pendingTextQueueRef.current.get(qId) === desiredText) {
            pendingTextQueueRef.current.delete(qId);
          }
          if (pendingBooleanQueueRef.current.get(qId) === desiredBoolean) {
            pendingBooleanQueueRef.current.delete(qId);
          }

          // Race-safe: only clear failure if this was the latest sequence
          if (saveSequenceRef.current.get(qId) === seq) {
            failedQuestionsRef.current.delete(qId);
            lastSaveErrorRef.current = null;
          }

          if (
            failedQuestionsRef.current.size === 0 &&
            pendingQueueRef.current.size === 0 &&
            pendingTextQueueRef.current.size === 0 &&
            pendingBooleanQueueRef.current.size === 0
          ) {
            setSavingStatus("saved");
          } else if (failedQuestionsRef.current.size > 0) {
            setSavingStatus("error");
            setSaveErrorMessage("خطا در ذخیره پاسخ روی سرور. لطفاً مجدداً تلاش کنید.");
          }
          return true;
        } catch (err) {
          // If request fails, clear pending queue entries for this attempted value so flush won't stall
          if (pendingQueueRef.current.get(qId) === desiredOptionId) {
            pendingQueueRef.current.delete(qId);
          }
          if (pendingTextQueueRef.current.get(qId) === desiredText) {
            pendingTextQueueRef.current.delete(qId);
          }
          if (pendingBooleanQueueRef.current.get(qId) === desiredBoolean) {
            pendingBooleanQueueRef.current.delete(qId);
          }

          // Race-safe: only mark as failed if no newer save sequence was started
          if (saveSequenceRef.current.get(qId) === seq) {
            failedQuestionsRef.current.add(qId);
            lastSaveErrorRef.current = err instanceof Error ? err : new Error(String(err));
            setSavingStatus("error");
            setSaveErrorMessage("خطا در ذخیره پاسخ روی سرور. لطفاً مجدداً تلاش کنید.");
          }
          return false;
        } finally {
          activeSavingRef.current.delete(qId);
          activeSavingPromisesRef.current.delete(qId);
          const nextOption = pendingQueueRef.current.get(qId);
          const nextText = pendingTextQueueRef.current.get(qId);
          const nextBoolean = pendingBooleanQueueRef.current.get(qId);
          const hasNewWork =
            (nextOption !== undefined && nextOption !== desiredOptionId) ||
            (nextText !== undefined && nextText !== desiredText) ||
            (nextBoolean !== undefined && nextBoolean !== desiredBoolean);
          if (hasNewWork && Date.now() <= deadlineMs) {
            void processQueueForQuestion(qId);
          }
        }
      };

      const savePromise = runSave();
      activeSavingPromisesRef.current.set(qId, savePromise);
      return savePromise;
    },
    [deadlineMs, getQuestionActiveDurationMs, saveMutation],
  );

  // ---------------------------------------------------------------------------
  // Retry Handler for Failed Answers
  // ---------------------------------------------------------------------------
  const retryFailedSaves = useCallback(() => {
    if (Date.now() > deadlineMs || isSubmitting) return;
    setSaveErrorMessage(null);
    setSubmitError(null);
    const failedIds = Array.from(failedQuestionsRef.current);
    for (const qId of failedIds) {
      if (!pendingQueueRef.current.has(qId) && selectedAnswers[qId] !== undefined) {
        pendingQueueRef.current.set(qId, selectedAnswers[qId]);
      }
      if (!pendingTextQueueRef.current.has(qId) && textAnswers[qId] !== undefined) {
        pendingTextQueueRef.current.set(qId, textAnswers[qId]);
      }
      if (!pendingBooleanQueueRef.current.has(qId) && statementAnswers[qId] !== undefined) {
        pendingBooleanQueueRef.current.set(qId, statementAnswers[qId]);
      }
      void processQueueForQuestion(qId);
    }
  }, [deadlineMs, isSubmitting, processQueueForQuestion, selectedAnswers, textAnswers, statementAnswers]);

  // ---------------------------------------------------------------------------
  // Multi-Statement Answer Selection Handler
  // ---------------------------------------------------------------------------
  const handleSelectStatementAnswer = (questionId: string, statementId: string, answer: boolean) => {
    if (isPastDeadline || isSubmitting) return;
    if (isPerQuestionTiming && timingInfo?.isCurrentQuestionExpired) return;

    const nowIso = new Date().toISOString();

    const currentMap = statementAnswers[questionId] || {};
    const updatedMap = {
      ...currentMap,
      [statementId]: answer,
    };

    setStatementAnswers((prev) => ({
      ...prev,
      [questionId]: updatedMap,
    }));

    setFinalizedMap((prev) => ({
      ...prev,
      [questionId]: {
        ...prev[questionId],
        answeredAt: prev[questionId]?.answeredAt ?? nowIso,
      },
    }));

    failedQuestionsRef.current.delete(questionId);
    pendingBooleanQueueRef.current.set(questionId, updatedMap);
    void processQueueForQuestion(questionId);
  };

  // ---------------------------------------------------------------------------
  // Option Selection Handler
  // ---------------------------------------------------------------------------
  const handleSelectOption = (questionId: string, optionId: string) => {
    if (isPastDeadline || isSubmitting) return;
    if (isPerQuestionTiming && timingInfo?.isCurrentQuestionExpired) return;

    const nowIso = new Date().toISOString();

    // 1. Immediately update UI local state
    setSelectedAnswers((prev) => ({
      ...prev,
      [questionId]: optionId,
    }));
    setFinalizedMap((prev) => ({
      ...prev,
      [questionId]: {
        ...prev[questionId],
        answeredAt: prev[questionId]?.answeredAt ?? nowIso,
        selectedOptionId: optionId,
      },
    }));

    // 2. Clear failure flag for this question since user made a new selection
    failedQuestionsRef.current.delete(questionId);

    // 3. Queue for race-safe serialized saving
    pendingQueueRef.current.set(questionId, optionId);
    void processQueueForQuestion(questionId);
  };

  // ---------------------------------------------------------------------------
  // Descriptive Text Answer Handler
  // ---------------------------------------------------------------------------
  const handleTextAnswerChange = (questionId: string, text: string) => {
    if (isPastDeadline || isSubmitting) return;
    if (isPerQuestionTiming && timingInfo?.isCurrentQuestionExpired) return;

    const now = Date.now();
    const nowIso = new Date(now).toISOString();

    const tracker = getOrCreateIntegrityTracker(questionId, textAnswers[questionId] || "");
    if (!tracker.startedAt) {
      tracker.startedAt = nowIso;
      tracker.timeline.push({ type: "start", timestamp: nowIso });
    }
    tracker.lastEditedAt = nowIso;

    const charDelta = text.length - tracker.lastTextSnapshot.length;
    const wordDelta = countWords(text) - countWords(tracker.lastTextSnapshot);
    const elapsedMs = Math.max(1, now - tracker.lastTextSnapshotTime);
    const isPasteTick = now - tracker.justPastedAt < 150;

    // Detect rapid input on non-paste insertions
    if (
      !isPasteTick &&
      charDelta >= RAPID_INPUT_CONFIG.minimumCharacters &&
      wordDelta >= RAPID_INPUT_CONFIG.minimumWords &&
      elapsedMs <= RAPID_INPUT_CONFIG.maximumDurationMs
    ) {
      const cps = charDelta / (elapsedMs / 1000);
      const wps = wordDelta / (elapsedMs / 1000);
      if (
        cps >= RAPID_INPUT_CONFIG.minimumCharactersPerSecond ||
        wps >= RAPID_INPUT_CONFIG.minimumWordsPerSecond
      ) {
        tracker.rapidInputCount += 1;
        tracker.rapidInputCharactersTotal += charDelta;
        tracker.rapidInputWordsTotal += wordDelta;
        if (tracker.rapidInputEvents.length < 100) {
          tracker.rapidInputEvents.push({
            timestamp: nowIso,
            characterCount: charDelta,
            wordCount: wordDelta,
            durationMs: elapsedMs,
            charactersPerSecond: Math.round(cps * 100) / 100,
            wordsPerSecond: Math.round(wps * 100) / 100,
          });
        }
        if (tracker.timeline.length < 150) {
          tracker.timeline.push({
            type: "rapid_input",
            timestamp: nowIso,
            characterDelta: charDelta,
            wordDelta: wordDelta,
            metadata: { chars: charDelta, words: wordDelta, durationMs: elapsedMs },
          });
        }
      }
    }

    // Debounced editing streaks
    if (!tracker.typingBatchActive) {
      tracker.typingBatchActive = true;
      tracker.editCount += 1;
      if (tracker.timeline.length < 150 && !isPasteTick) {
        tracker.timeline.push({
          type: "typing",
          timestamp: nowIso,
          characterDelta: charDelta > 0 ? charDelta : undefined,
        });
      }
    }
    if (tracker.typingBatchTimer) {
      clearTimeout(tracker.typingBatchTimer);
    }
    tracker.typingBatchTimer = setTimeout(() => {
      tracker.typingBatchActive = false;
    }, 2000);

    tracker.lastTextSnapshot = text;
    tracker.lastTextSnapshotTime = now;

    setTextAnswers((prev) => ({
      ...prev,
      [questionId]: text,
    }));
    setFinalizedMap((prev) => ({
      ...prev,
      [questionId]: {
        ...prev[questionId],
        answeredAt: prev[questionId]?.answeredAt ?? nowIso,
      },
    }));

    failedQuestionsRef.current.delete(questionId);
    pendingTextQueueRef.current.set(questionId, text);
    void processQueueForQuestion(questionId);
  };

  // ---------------------------------------------------------------------------
  // Flush All Pending Saves
  // ---------------------------------------------------------------------------
  const flushPendingSaves = useCallback(async (): Promise<{ success: boolean; failedCount: number }> => {
    // 1. Launch any pending questions that are not currently in flight
    const pendingQuestions = Array.from(
      new Set([
        ...pendingQueueRef.current.keys(),
        ...pendingTextQueueRef.current.keys(),
        ...pendingBooleanQueueRef.current.keys(),
      ]),
    );
    for (const qId of pendingQuestions) {
      if (!activeSavingPromisesRef.current.has(qId)) {
        void processQueueForQuestion(qId);
      }
    }

    // 2. Wait until all active in-flight requests finish (lifecycle-aware with 15s safeguard ceiling)
    const flushStart = Date.now();
    while (
      (activeSavingPromisesRef.current.size > 0 ||
        pendingQueueRef.current.size > 0 ||
        pendingTextQueueRef.current.size > 0 ||
        pendingBooleanQueueRef.current.size > 0) &&
      Date.now() - flushStart < 15000
    ) {
      const activePromises = Array.from(activeSavingPromisesRef.current.values());
      if (activePromises.length > 0) {
        await Promise.allSettled(activePromises);
      } else {
        await new Promise((r) => setTimeout(r, 20));
      }
    }

    // 3. Determine if everything was saved successfully
    const hasActive = activeSavingPromisesRef.current.size > 0;
    const hasPending =
      pendingQueueRef.current.size > 0 ||
      pendingTextQueueRef.current.size > 0 ||
      pendingBooleanQueueRef.current.size > 0;
    const hasFailed = failedQuestionsRef.current.size > 0;

    if (hasActive || hasPending || hasFailed) {
      return {
        success: false,
        failedCount:
          failedQuestionsRef.current.size ||
          pendingQueueRef.current.size ||
          pendingTextQueueRef.current.size ||
          pendingBooleanQueueRef.current.size ||
          activeSavingPromisesRef.current.size,
      };
    }

    return { success: true, failedCount: 0 };
  }, [processQueueForQuestion]);

  // ---------------------------------------------------------------------------
  // Final Submission Handler
  // ---------------------------------------------------------------------------
  const handleConfirmSubmit = async () => {
    if (isSubmitting) return;

    setIsSubmitting(true);
    setSubmitError(null);
    stopQuestionActiveSlice();

    try {
      if (isPerQuestionTiming) {
        const currentQ = (attempt.questions || [])[currentIndex];
        if (currentQ) {
          const optId = selectedAnswers[currentQ.id] ?? null;
          const textAns = textAnswers[currentQ.id] ?? null;
          const nowIso = new Date().toISOString();
          const activeMs = getQuestionActiveDurationMs(currentQ.id);
          const tabSwitches = questionTabSwitchesRef.current.get(currentQ.id) || 0;

          setFinalizedMap((prev) => ({
            ...prev,
            [currentQ.id]: {
              answeredAt: prev[currentQ.id]?.answeredAt ?? nowIso,
              finalizedAt: nowIso,
              selectedOptionId: optId,
            },
          }));
          pendingQueueRef.current.delete(currentQ.id);
          pendingTextQueueRef.current.delete(currentQ.id);
          try {
            await saveMutation.mutateAsync({
              questionId: currentQ.id,
              selectedOptionId: optId,
              textAnswer: textAns,
              finalized: true,
              activeDurationMs: activeMs,
              tabSwitchesCount: tabSwitches,
            });
          } catch (err) {
            console.error("Failed to finalize last answer before submit:", err);
          }
        }
      } else if (!isPastDeadline) {
        // Automatic Recovery Attempt: if any failed questions exist, re-queue them before flushing
        if (failedQuestionsRef.current.size > 0) {
          const failedIds = Array.from(failedQuestionsRef.current);
          for (const qId of failedIds) {
            if (selectedAnswers[qId] !== undefined && !pendingQueueRef.current.has(qId)) {
              pendingQueueRef.current.set(qId, selectedAnswers[qId]);
            }
            if (textAnswers[qId] !== undefined && !pendingTextQueueRef.current.has(qId)) {
              pendingTextQueueRef.current.set(qId, textAnswers[qId]);
            }
            if (statementAnswers[qId] !== undefined && !pendingBooleanQueueRef.current.has(qId)) {
              pendingBooleanQueueRef.current.set(qId, statementAnswers[qId]);
            }
          }
        }

        const flushResult = await flushPendingSaves();
        if (!flushResult.success) {
          const count = failedQuestionsRef.current.size;
          const lastErr = lastSaveErrorRef.current;
          let userMsg: string;

          if (lastErr instanceof ApiError && lastErr.code === "bad_request") {
            userMsg = lastErr.message || "اطلاعات یکی از پاسخ‌ها نامعتبر است. لطفاً پاسخ‌های خود را بررسی کنید.";
          } else if (typeof navigator !== "undefined" && !navigator.onLine) {
            userMsg = "ارتباط با سرور برقرار نشد. اتصال اینترنت را بررسی کنید و دوباره تلاش کنید.";
          } else if (count > 0) {
            userMsg = `ذخیره ${toPersianDigits(count)} پاسخ کامل نشد. لطفاً اتصال اینترنت را بررسی کرده و مجدداً تلاش کنید.`;
          } else {
            userMsg = "برخی پاسخ‌ها هنوز ذخیره نشده‌اند. لطفاً چند لحظه دیگر دوباره تلاش کنید.";
          }

          setSubmitError(userMsg);
          setIsSubmitting(false);
          return;
        }
      }

      const res = await submitMutation.mutateAsync();
      setSubmitConfirmOpen(false);
      onSubmitSuccess(res.result);
      navigate(`/classrooms/${classroomId}/exams/${examId}/results`);
    } catch (err) {
      if (err instanceof ApiError && (err.statusCode === 409 || err.code === "conflict")) {
        // Attempt already finalized on server (e.g. earlier submit or concurrent finalization)
        // Refresh cache so result views show up-to-date server state
        void queryClient.invalidateQueries({ queryKey: studentExamKeys.currentAttempt(examId) });
        void queryClient.invalidateQueries({ queryKey: studentExamKeys.review(examId) });
        if (classroomId) {
          void queryClient.invalidateQueries({
            queryKey: studentExamKeys.classroomExams(classroomId),
          });
        }
        void queryClient.invalidateQueries({ queryKey: studentExamKeys.allExams() });

        setSubmitConfirmOpen(false);
        navigate(`/classrooms/${classroomId}/exams/${examId}/results`);
      } else if (err instanceof ApiError && err.statusCode === 408) {
        setSubmitError("مهلت ارسال آزمون به پایان رسیده و آزمون بسته شده است.");
        setSubmitConfirmOpen(false);
        navigate(`/classrooms/${classroomId}/exams/${examId}/results`);
      } else {
        setSubmitError(
          err instanceof Error
            ? err.message
            : "خطا در ثبت نهایی آزمون. لطفاً اتصال خود را بررسی کرده و دوباره تلاش کنید.",
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Next Question Handler (Manual click)
  const handleNextQuestion = async () => {
    const questions = attempt.questions || [];
    const total = questions.length;
    if (currentIndex >= total - 1) return;

    stopQuestionActiveSlice();

    if (isPerQuestionTiming) {
      const currentQ = questions[currentIndex];
      if (currentQ) {
        const optId = selectedAnswers[currentQ.id] ?? null;
        const textAns = textAnswers[currentQ.id] ?? null;
        const nowIso = new Date().toISOString();
        const activeMs = getQuestionActiveDurationMs(currentQ.id);
        const tabSwitches = questionTabSwitchesRef.current.get(currentQ.id) || 0;

        setFinalizedMap((prev) => ({
          ...prev,
          [currentQ.id]: {
            answeredAt: prev[currentQ.id]?.answeredAt ?? nowIso,
            finalizedAt: nowIso,
            selectedOptionId: optId,
          },
        }));
        pendingQueueRef.current.delete(currentQ.id);
        pendingTextQueueRef.current.delete(currentQ.id);
        void saveMutation.mutateAsync({
          questionId: currentQ.id,
          selectedOptionId: optId,
          textAnswer: textAns,
          finalized: true,
          activeDurationMs: activeMs,
          tabSwitchesCount: tabSwitches,
        }).catch((err) => console.error("Manual finalize error:", err));
      }
    }
    goToIndex((prev) => prev + 1);
  };

  // Auto-advance / timeout effect for Per-Question Timing
  const autoAdvancedQuestionsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!isPerQuestionTiming || !timingInfo) return;
    const questions = attempt.questions || [];
    const total = questions.length;

    // If all questions have expired or overall exam is expired
    if (timingInfo.isAllQuestionsExpired || nowMs > deadlineMs) {
      if (!isSubmitting) {
        void handleConfirmSubmit();
      }
      return;
    }

    if (timingInfo.isCurrentQuestionExpired) {
      const currentQ = questions[timingInfo.currentIndex];
      if (currentQ && !autoAdvancedQuestionsRef.current.has(currentQ.id)) {
        autoAdvancedQuestionsRef.current.add(currentQ.id);
        stopQuestionActiveSlice();
        const optId = selectedAnswers[currentQ.id] ?? null;
        const textAns = textAnswers[currentQ.id] ?? null;
        const nowIso = new Date().toISOString();
        const activeMs = getQuestionActiveDurationMs(currentQ.id);
        const tabSwitches = questionTabSwitchesRef.current.get(currentQ.id) || 0;

        setFinalizedMap((prev) => ({
          ...prev,
          [currentQ.id]: {
            answeredAt: prev[currentQ.id]?.answeredAt ?? nowIso,
            finalizedAt: nowIso,
            selectedOptionId: optId,
          },
        }));

        pendingQueueRef.current.delete(currentQ.id);
        pendingTextQueueRef.current.delete(currentQ.id);
        void saveMutation.mutateAsync({
          questionId: currentQ.id,
          selectedOptionId: optId,
          textAnswer: textAns,
          finalized: true,
          activeDurationMs: activeMs,
          tabSwitchesCount: tabSwitches,
        }).catch((err) => console.error("Auto finalize save error:", err));

        if (timingInfo.currentIndex >= total - 1) {
          void handleConfirmSubmit();
        } else {
          goToIndex(timingInfo.currentIndex + 1);
        }
      }
    }
  }, [
    isPerQuestionTiming,
    timingInfo,
    nowMs,
    deadlineMs,
    attempt.questions,
    isSubmitting,
    selectedAnswers,
    textAnswers,
    saveMutation,
    goToIndex,
    stopQuestionActiveSlice,
    getQuestionActiveDurationMs,
  ]);

  // Auto-submit or navigate when grace period expires (non-timed mode)
  useEffect(() => {
    if (!isPerQuestionTiming && isPastGrace && !isSubmitting) {
      // Grace period expired, automatically submit
      void handleConfirmSubmit();
    }
  }, [isPerQuestionTiming, isPastGrace, isSubmitting]);

  // ---------------------------------------------------------------------------
  // Questions Navigation Helpers
  // ---------------------------------------------------------------------------
  const questions = attempt.questions || [];
  const currentQuestion = questions[currentIndex];
  const totalQuestions = questions.length;

  const answeredCount = questions.filter((q) => {
    if (q.questionType === "descriptive") {
      return Boolean(textAnswers[q.id] && textAnswers[q.id].trim().length > 0);
    }
    if (q.questionType === "true_false") {
      const stmts = q.statements || [];
      const ans = statementAnswers[q.id];
      return stmts.length > 0 && stmts.every((s) => ans && typeof ans[s.id] === "boolean");
    }
    return Boolean(selectedAnswers[q.id] && selectedAnswers[q.id].trim().length > 0);
  }).length;
  const unansweredCount = Math.max(0, totalQuestions - answeredCount);

  if (!currentQuestion) {
    return (
      <div className="w-full py-20 flex justify-center text-sm font-sans" dir="rtl">
        سؤالی برای این آزمون یافت نشد.
      </div>
    );
  }

  const isCurrentDescriptive = currentQuestion.questionType === "descriptive";

  return (
    <div className="min-h-screen bg-[var(--color-bg-default)] text-[var(--color-text)] flex flex-col font-sans select-none" dir="rtl">
      {/* --------------------------------------------------------------------- */}
      {/* Sticky Top Header Bar */}
      {/* --------------------------------------------------------------------- */}
      <header className="sticky top-0 z-40 bg-[var(--color-surface)] border-b border-[var(--color-border)] shadow-xs">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          {/* Exit / Return Action */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setExitConfirmOpen(true)}
              className="text-xs"
            >
              <LogOut className="w-4 h-4 ml-1 text-[var(--color-text-muted)]" />
              <span className="hidden sm:inline">خروج موقت</span>
            </Button>
            <span className="text-sm font-bold text-[var(--color-text)] line-clamp-1 max-w-[200px] sm:max-w-md">
              {examTitle}
            </span>
          </div>

          {/* Timer Display */}
          <div className="flex items-center gap-3">
            {isPerQuestionTiming && timingInfo ? (
              <div className="flex items-center gap-2">
                <div
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-mono text-xs sm:text-sm font-bold transition-colors ${
                    timingInfo.currentQuestionRemainingSeconds <= 5
                      ? "bg-red-500/10 text-red-600 animate-pulse border border-red-500/30"
                      : timingInfo.currentQuestionRemainingSeconds <= 15
                      ? "bg-amber-500/10 text-amber-600 border border-amber-500/20"
                      : "bg-[#008080]/10 text-[#008080] border border-[#008080]/20"
                  }`}
                >
                  <Clock className="w-4 h-4" />
                  <span>زمان سؤال: {formatTime(timingInfo.currentQuestionRemainingSeconds)}</span>
                </div>
                <div className="hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-[var(--color-text-muted)] text-xs font-mono">
                  <span>کل آزمون: {formatTime(remainingSeconds)}</span>
                </div>
              </div>
            ) : (
              <div
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-mono text-sm font-bold transition-colors ${
                  isPastDeadline
                    ? "bg-red-500/10 text-red-600 animate-pulse border border-red-500/30"
                    : remainingSeconds <= 60
                    ? "bg-red-500/10 text-red-600 animate-pulse border border-red-500/20"
                    : remainingSeconds <= 300
                    ? "bg-amber-500/10 text-amber-600 border border-amber-500/20"
                    : "bg-[#008080]/10 text-[#008080] border border-[#008080]/20"
                }`}
              >
                <Clock className="w-4 h-4" />
                <span>
                  {isPastDeadline
                    ? `مهلت ثبت: ${formatTime(graceRemainingSeconds)}`
                    : formatTime(remainingSeconds)}
                </span>
              </div>
            )}

            {/* Submit Action (Desktop) */}
            <Button
              variant="primary"
              size="sm"
              className="hidden sm:flex"
              onClick={() => setSubmitConfirmOpen(true)}
              isLoading={isSubmitting}
            >
              ثبت و پایان آزمون
            </Button>
          </div>
        </div>

        {/* Tab Switch Security Warning Banner */}
        {tabSwitchAlert && (
          <div className="bg-amber-500 text-white text-xs py-1 px-4 text-center font-medium flex items-center justify-center gap-1.5 shadow-xs">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>
              خروج از تب آزمون ثبت شد ({toPersianDigits(tabSwitchesCountRef.current)} مرتبه). طبق قوانین آزمون، زمان آزمون متوقف نشده و تمام فعالیت‌ها ثبت می‌شوند.
            </span>
          </div>
        )}

        {/* Warning Banners */}
        {isPastDeadline && (
          <div className="bg-red-600 text-white text-xs py-1.5 px-4 text-center font-medium">
            زمان پاسخگویی به پایان رسیده است. شما در مهلت ۶۰ ثانیه‌ای ثبت و ارسال نهایی هستید.
          </div>
        )}
      </header>

      {/* --------------------------------------------------------------------- */}
      {/* Main Body */}
      {/* --------------------------------------------------------------------- */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-6 pb-28">
        {/* Question Navigator (Horizontal Pills Bar) */}
        <div className="mb-6 p-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl">
          <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)] mb-2.5 px-1">
            <span>
              سؤال {toPersianDigits(currentIndex + 1)} از {toPersianDigits(totalQuestions)}
            </span>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1 text-emerald-600 font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                {toPersianDigits(answeredCount)} پاسخ داده شده
              </span>
              <span className="flex items-center gap-1 text-[var(--color-text-muted)]">
                <span className="w-2 h-2 rounded-full bg-neutral-300 dark:bg-neutral-600" />
                {toPersianDigits(unansweredCount)} بی‌پاسخ
              </span>
            </div>
          </div>

          {/* Quick Nav Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {questions.map((q, idx) => {
              const isAnswered = q.questionType === "descriptive"
                ? Boolean(textAnswers[q.id] && textAnswers[q.id].trim().length > 0)
                : q.questionType === "true_false"
                ? Boolean((q.statements || []).length > 0 && (q.statements || []).every((s) => statementAnswers[q.id] && typeof statementAnswers[q.id][s.id] === "boolean"))
                : Boolean(selectedAnswers[q.id]);
              const isCurrent = idx === currentIndex;
              const isPrevious = idx < currentIndex;
              const isNavBlocked = (!attempt.allowBackNavigation && isPrevious) || (isPerQuestionTiming && idx !== currentIndex);

              return (
                <button
                  key={q.id}
                  type="button"
                  disabled={isNavBlocked}
                  onClick={() => !isPerQuestionTiming && goToIndex(idx)}
                  className={`w-8 h-8 rounded-lg text-xs font-bold shrink-0 transition-all ${
                    isCurrent
                      ? "ring-2 ring-[#008080] bg-[#008080] text-white"
                      : isNavBlocked
                      ? "opacity-40 cursor-not-allowed bg-neutral-100 text-neutral-400"
                      : isAnswered
                      ? "bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/25"
                      : "bg-neutral-100 hover:bg-neutral-200 text-neutral-600"
                  }`}
                >
                  {toPersianDigits(idx + 1)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Question Card */}
        <Card className="p-6 sm:p-8 border border-[var(--color-border)] rounded-3xl bg-[var(--color-surface)] shadow-xs space-y-6">
          {/* Question Header & Points */}
          <div className="flex items-center justify-between gap-4 pb-4 border-b border-[var(--color-border)]">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-[#008080] bg-[#008080]/10 px-3 py-1 rounded-xl">
                سؤال {toPersianDigits(currentIndex + 1)}
              </span>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-[var(--color-text-muted)]">
                {isCurrentDescriptive
                  ? "تشریحی"
                  : currentQuestion.questionType === "true_false"
                  ? "صحیح / غلط"
                  : "تستی"}
              </span>
            </div>
            {currentQuestion.points !== undefined && (
              <span className="text-xs text-[var(--color-text-muted)] font-medium">
                {toPersianDigits(currentQuestion.points)} نمره
              </span>
            )}
          </div>

          {/* Question Prompt */}
          <div className="text-base sm:text-lg font-medium text-[var(--color-text)] leading-relaxed">
            <RichContent content={currentQuestion.prompt} />
          </div>

          {/* Options List or Statements List or Descriptive Textarea */}
          {isCurrentDescriptive ? (
            <div className="space-y-3 pt-2">
              <label className="block text-xs font-semibold text-[var(--color-text)]">
                پاسخ تشریحی شما:
              </label>
              <textarea
                value={textAnswers[currentQuestion.id] || ""}
                onChange={(e) => handleTextAnswerChange(currentQuestion.id, e.target.value)}
                onPaste={(e) => handlePaste(currentQuestion.id, e)}
                disabled={
                  isPastDeadline ||
                  isSubmitting ||
                  (isPerQuestionTiming && Boolean(timingInfo?.isCurrentQuestionExpired))
                }
                placeholder="پاسخ تشریحی خود را اینجا بنویسید (حداکثر ۱۰,۰۰۰ کاراکتر)..."
                maxLength={10000}
                rows={7}
                className="w-full p-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] text-sm leading-relaxed focus:outline-hidden focus:ring-2 focus:ring-[#008080] focus:border-[#008080] transition-all resize-y"
              />
              <div className="flex justify-between items-center text-xs text-[var(--color-text-muted)]">
                <span>پاسخ شما به طور خودکار ذخیره می‌شود.</span>
                <span>
                  {toPersianDigits((textAnswers[currentQuestion.id] || "").length)} / {toPersianDigits(10000)} کاراکتر
                </span>
              </div>
            </div>
          ) : currentQuestion.questionType === "true_false" ? (
            <div className="space-y-3 pt-2">
              {(currentQuestion.statements || []).map((stmt, stmtIdx) => {
                const currentAns = statementAnswers[currentQuestion.id]?.[stmt.id];
                const isStatementDisabled =
                  isPastDeadline ||
                  isSubmitting ||
                  (isPerQuestionTiming && Boolean(timingInfo?.isCurrentQuestionExpired));

                return (
                  <div
                    key={stmt.id}
                    className="p-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] space-y-3 shadow-2xs"
                  >
                    <div className="flex items-start gap-2.5">
                      <span className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold bg-[var(--color-surface-warm)] border border-[var(--color-border)]">
                        {toPersianDigits(stmtIdx + 1)}
                      </span>
                      <p className="text-sm sm:text-base font-medium text-[var(--color-text)] leading-relaxed">
                        {stmt.text}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5 pt-1">
                      {/* Option True */}
                      <button
                        type="button"
                        disabled={isStatementDisabled}
                        onClick={() => handleSelectStatementAnswer(currentQuestion.id, stmt.id, true)}
                        className={`p-3 rounded-xl border text-xs sm:text-sm font-bold flex items-center justify-between transition-all cursor-pointer ${
                          currentAns === true
                            ? "bg-emerald-500/15 border-emerald-500 text-emerald-800 dark:text-emerald-300 ring-1 ring-emerald-500 shadow-2xs"
                            : "border-[var(--color-border)] bg-[var(--color-surface-warm)]/40 hover:border-neutral-300 text-[var(--color-text)]"
                        } ${isStatementDisabled ? "opacity-60 cursor-not-allowed" : ""}`}
                      >
                        <span>صحیح</span>
                        <div
                          className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                            currentAns === true ? "border-emerald-600 bg-emerald-600 text-white" : "border-neutral-300"
                          }`}
                        >
                          {currentAns === true && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </div>
                      </button>

                      {/* Option False */}
                      <button
                        type="button"
                        disabled={isStatementDisabled}
                        onClick={() => handleSelectStatementAnswer(currentQuestion.id, stmt.id, false)}
                        className={`p-3 rounded-xl border text-xs sm:text-sm font-bold flex items-center justify-between transition-all cursor-pointer ${
                          currentAns === false
                            ? "bg-rose-500/15 border-rose-500 text-rose-800 dark:text-rose-300 ring-1 ring-rose-500 shadow-2xs"
                            : "border-[var(--color-border)] bg-[var(--color-surface-warm)]/40 hover:border-neutral-300 text-[var(--color-text)]"
                        } ${isStatementDisabled ? "opacity-60 cursor-not-allowed" : ""}`}
                      >
                        <span>غلط</span>
                        <div
                          className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                            currentAns === false ? "border-rose-600 bg-rose-600 text-white" : "border-neutral-300"
                          }`}
                        >
                          {currentAns === false && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </div>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-3 pt-2">
              {(currentQuestion.options || []).map((option, optIdx) => {
                const isSelected = selectedAnswers[currentQuestion.id] === option.id;
                const optionLetter = OPTION_LABELS[optIdx] ?? String(optIdx + 1);
                const isOptionDisabled =
                  isPastDeadline ||
                  isSubmitting ||
                  (isPerQuestionTiming && Boolean(timingInfo?.isCurrentQuestionExpired));

                return (
                  <button
                    key={option.id}
                    type="button"
                    disabled={isOptionDisabled}
                    onClick={() => handleSelectOption(currentQuestion.id, option.id)}
                    className={`w-full text-right p-4 rounded-2xl border transition-all flex items-center justify-between gap-3 text-sm cursor-pointer ${
                      isSelected
                        ? "border-[#008080] bg-[#008080]/5 text-[var(--color-text)] shadow-xs ring-1 ring-[#008080]"
                        : "border-[var(--color-border)] bg-[var(--color-surface)] hover:border-neutral-300 hover:bg-neutral-50/50 text-[var(--color-text)]"
                    } ${isOptionDisabled ? "opacity-60 cursor-not-allowed" : ""}`}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 transition-colors ${
                          isSelected
                            ? "bg-[#008080] text-white"
                            : "bg-neutral-100 text-neutral-600"
                        }`}
                      >
                        {optionLetter}
                      </span>
                      <span className="leading-relaxed font-normal">{option.text}</span>
                    </div>

                    <div
                      className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                        isSelected
                          ? "border-[#008080] bg-[#008080] text-white"
                          : "border-neutral-300"
                      }`}
                    >
                      {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </Card>
      </main>

      {/* --------------------------------------------------------------------- */}
      {/* Sticky Bottom Action Bar */}
      {/* --------------------------------------------------------------------- */}
      <footer className="fixed bottom-0 left-0 right-0 z-40 bg-[var(--color-surface)] border-t border-[var(--color-border)] py-3 px-4 sm:px-6 shadow-md">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          {/* Previous Button */}
          <Button
            variant="outline"
            size="md"
            onClick={() => goToIndex((prev) => prev - 1)}
            disabled={currentIndex === 0 || !attempt.allowBackNavigation || isPerQuestionTiming}
            className="text-xs sm:text-sm"
          >
            <ArrowRight className="w-4 h-4 ml-1" />
            سؤال قبلی
          </Button>

          {/* Autosave Status Indicator */}
          <div className="text-xs text-[var(--color-text-muted)] flex items-center gap-1.5">
            {savingStatus === "saving" ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#008080]" />
                <span className="hidden sm:inline">در حال ذخیره...</span>
              </>
            ) : savingStatus === "saved" ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span className="hidden sm:inline">ذخیره شد</span>
              </>
            ) : savingStatus === "error" ? (
              <div className="flex items-center gap-1.5 text-xs text-red-500 font-semibold">
                <span>{saveErrorMessage || "خطا در ذخیره پاسخ روی سرور. لطفاً مجدداً تلاش کنید."}</span>
                <button
                  type="button"
                  onClick={retryFailedSaves}
                  className="inline-flex items-center gap-1 text-[#008080] hover:underline font-bold mr-1 cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>تلاش مجدد</span>
                </button>
              </div>
            ) : null}
          </div>

          {/* Next / Submit Button */}
          <div className="flex items-center gap-2">
            {currentIndex < totalQuestions - 1 ? (
              <Button
                variant="primary"
                size="md"
                onClick={handleNextQuestion}
                className="text-xs sm:text-sm"
              >
                سؤال بعدی
                <ArrowLeft className="w-4 h-4 mr-1" />
              </Button>
            ) : (
              <Button
                variant="primary"
                size="md"
                onClick={() => setSubmitConfirmOpen(true)}
                isLoading={isSubmitting}
                className="bg-emerald-600 hover:bg-emerald-700 text-xs sm:text-sm"
              >
                پایان آزمون
                <Send className="w-4 h-4 mr-1" />
              </Button>
            )}
          </div>
        </div>
      </footer>

      {/* --------------------------------------------------------------------- */}
      {/* Exit Confirmation Dialog */}
      {/* --------------------------------------------------------------------- */}
      <Dialog
        isOpen={exitConfirmOpen}
        onClose={() => setExitConfirmOpen(false)}
        maxWidth="md"
        ariaLabel="خروج موقت از آزمون"
      >
        <DialogHeader onClose={() => setExitConfirmOpen(false)}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-[var(--color-text)]">
              خروج از محیط آزمون
            </h3>
          </div>
        </DialogHeader>
        <DialogContent>
          <div className="space-y-3 text-xs sm:text-sm text-[var(--color-text-muted)] leading-relaxed">
            <p>
              پاسخ‌های شما تا این لحظه به طور خودکار در سرور ذخیره شده‌اند.
            </p>
            <Alert variant="warning" title="توجه به زمان آزمون">
              با خروج از این صفحه، <strong>زمان‌سنج آزمون متوقف نخواهد شد</strong> و تا زمان سررسید مهلت آزمون می‌توانید بازگردید و آزمون را ادامه دهید.
            </Alert>
          </div>
        </DialogContent>
        <DialogFooter>
          <div className="flex items-center justify-end gap-2.5 w-full">
            <Button variant="outline" size="sm" onClick={() => setExitConfirmOpen(false)}>
              ادامه آزمون
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setExitConfirmOpen(false);
                onExit();
              }}
            >
              خروج از صفحه
            </Button>
          </div>
        </DialogFooter>
      </Dialog>

      {/* --------------------------------------------------------------------- */}
      {/* Submit Confirmation Dialog */}
      {/* --------------------------------------------------------------------- */}
      <Dialog
        isOpen={submitConfirmOpen}
        onClose={isSubmitting ? () => {} : () => setSubmitConfirmOpen(false)}
        maxWidth="md"
        ariaLabel="ثبت و پایان آزمون"
      >
        <DialogHeader onClose={isSubmitting ? undefined : () => setSubmitConfirmOpen(false)}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#008080]/10 text-[#008080] flex items-center justify-center shrink-0">
              <Send className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-[var(--color-text)]">
              تأیید پایان و ثبت نهایی آزمون
            </h3>
          </div>
        </DialogHeader>
        <DialogContent>
          <div className="space-y-4 text-xs sm:text-sm leading-relaxed">
            {submitError && (
              <Alert variant="error" title="خطا در ثبت نهایی">
                <div>{submitError}</div>
                {failedQuestionsRef.current.size > 0 && (
                  <div className="mt-2.5">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={retryFailedSaves}
                      disabled={isSubmitting}
                    >
                      <RefreshCw className="w-3.5 h-3.5 ml-1" />
                      تلاش مجدد برای ذخیره پاسخ‌ها
                    </Button>
                  </div>
                )}
              </Alert>
            )}

            <div className="p-4 bg-[var(--color-bg-default)] border border-[var(--color-border)] rounded-2xl space-y-2">
              <div className="flex justify-between items-center text-emerald-600 font-semibold">
                <span>تعداد سؤالات پاسخ داده شده:</span>
                <span>{toPersianDigits(answeredCount)} از {toPersianDigits(totalQuestions)}</span>
              </div>
              {unansweredCount > 0 && (
                <div className="flex justify-between items-center text-amber-600 font-semibold">
                  <span>تعداد سؤالات بدون پاسخ:</span>
                  <span>{toPersianDigits(unansweredCount)} سؤال</span>
                </div>
              )}
            </div>

            <p className="text-[var(--color-text-muted)]">
              پس از ثبت نهایی، امکان ویرایش یا بازگشت به سؤالات وجود نخواهد داشت و آزمون شما تصحیح خواهد شد. آیا از ارسال نهایی اطمینان دارید؟
            </p>
          </div>
        </DialogContent>
        <DialogFooter>
          <div className="flex items-center justify-end gap-2.5 w-full">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSubmitConfirmOpen(false)}
              disabled={isSubmitting}
            >
              بازگشت به آزمون
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleConfirmSubmit}
              isLoading={isSubmitting}
              disabled={isSubmitting}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              تأیید و ثبت نهایی
            </Button>
          </div>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
