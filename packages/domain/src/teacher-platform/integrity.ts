/**
 * Descriptive Answer Integrity & Behavioral Telemetry.
 *
 * Provides pure domain models, configurable thresholds, and evaluation logic for:
 * 1. Paste detection (any paste, small/medium/large classification) without clipboard persistence
 * 2. Rapid input detection based on delta character/word velocity
 * 3. Editing and revision tracking
 * 4. Safe timeline reconstruction
 * 5. Non-accusatory integrity analysis for teacher review
 */

import { toPersianDigits } from "../persian-numbers.js";

// ---------------------------------------------------------------------------
// Configurable Thresholds & Limits
// ---------------------------------------------------------------------------

export const PASTE_SIZE_THRESHOLDS = Object.freeze({
  SMALL: 50, // Characters: <= 50 is small
  MEDIUM: 250, // Characters: 51..250 is medium
  LARGE: 800, // Characters: > 800 is large paste
});

export const PASTE_WORD_THRESHOLDS = Object.freeze({
  SMALL: 10,
  MEDIUM: 40,
  LARGE: 150,
});

/**
 * Rapid input detection configuration (delta-based).
 * Triggered when a significant chunk of text is inserted in a short time window.
 */
export const RAPID_INPUT_CONFIG = Object.freeze({
  minimumCharacters: 60,
  minimumWords: 12,
  maximumDurationMs: 2500,
  minimumCharactersPerSecond: 30,
  minimumWordsPerSecond: 6,
});

/**
 * Bounds & Safety limits for telemetry payloads to protect database & memory.
 */
export const INTEGRITY_LIMITS = Object.freeze({
  maxPasteEvents: 100,
  maxRapidInputEvents: 100,
  maxTimelineEvents: 150,
  maxEditCount: 10000,
  maxDurationMs: 86_400_000, // 24 hours
  maxCharacters: 20000,
  maxWords: 5000,
});

/**
 * Throttle interval for reconnect events per client session (server-side monotonic duration).
 * Repeated page refreshes within this window are ignored to avoid artificial count inflation.
 */
export const RECONNECT_THROTTLE_WINDOW_MS = 15_000;

// ---------------------------------------------------------------------------
// Telemetry Event Interfaces
// ---------------------------------------------------------------------------

export interface DescriptivePasteEvent {
  timestamp: string; // ISO 8601 string
  characterCount: number;
  wordCount: number;
  cursorPosition?: number | null;
}

export interface DescriptiveRapidInputEvent {
  timestamp: string; // ISO 8601 string
  characterCount: number;
  wordCount: number;
  durationMs: number;
  charactersPerSecond: number;
  wordsPerSecond: number;
}

export type DescriptiveTimelineEventType =
  | "start"
  | "typing"
  | "paste"
  | "rapid_input"
  | "edit"
  | "submit";

export interface DescriptiveTimelineEvent {
  type: DescriptiveTimelineEventType;
  timestamp: string; // ISO 8601 string
  characterDelta?: number | null;
  wordDelta?: number | null;
  metadata?: Record<string, string | number | boolean | null>;
}

// ---------------------------------------------------------------------------
// Stored & In-Flight Telemetry Model
// ---------------------------------------------------------------------------

export interface DescriptiveAnswerIntegrityData {
  startedAt?: string | null;
  lastEditedAt?: string | null;
  durationMs?: number | null;
  editCount: number;
  pasteCount: number;
  pastedCharactersTotal: number;
  pastedWordsTotal: number;
  rapidInputCount: number;
  rapidInputCharactersTotal: number;
  rapidInputWordsTotal: number;
  pasteEvents?: DescriptivePasteEvent[];
  rapidInputEvents?: DescriptiveRapidInputEvent[];
  timeline?: DescriptiveTimelineEvent[];
}

// ---------------------------------------------------------------------------
// Evaluated Analysis Output for Teacher Review
// ---------------------------------------------------------------------------

export interface DescriptiveAnswerIntegrityAnalysis {
  pasteDetected: boolean;
  pasteCount: number;
  pastedCharactersTotal: number;
  pastedWordsTotal: number;
  finalAnswerCharacters: number;
  finalAnswerWords: number;
  pasteRatio: number; // 0.0 to 1.0 (pastedCharactersTotal / max(1, finalAnswerCharacters))
  largePasteDetected: boolean;
  rapidInputDetected: boolean;
  rapidInputCount: number;
  telemetryInconsistencyDetected: boolean;
  editCount: number;
  durationMs: number | null;
  reviewRecommended: boolean;
  signals: string[];
  timeline: DescriptiveTimelineEvent[];
}

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Calculates Persian/English word count accurately from a string.
 */
export function countWords(text: string | null | undefined): number {
  if (!text || typeof text !== "string") return 0;
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

/**
 * Pure evaluation function generating objective signals from answer text and telemetry data.
 * Does NOT accuse student of cheating or make definitive AI claims.
 */
export function analyzeDescriptiveAnswerIntegrity(
  textAnswer: string | null | undefined,
  telemetry?: DescriptiveAnswerIntegrityData | null,
): DescriptiveAnswerIntegrityAnalysis {
  const normalizedText = typeof textAnswer === "string" ? textAnswer : "";
  const finalAnswerCharacters = normalizedText.length;
  const finalAnswerWords = countWords(normalizedText);

  if (!telemetry) {
    return {
      pasteDetected: false,
      pasteCount: 0,
      pastedCharactersTotal: 0,
      pastedWordsTotal: 0,
      finalAnswerCharacters,
      finalAnswerWords,
      pasteRatio: 0,
      largePasteDetected: false,
      rapidInputDetected: false,
      rapidInputCount: 0,
      telemetryInconsistencyDetected: false,
      editCount: 0,
      durationMs: null,
      reviewRecommended: false,
      signals: [],
      timeline: [],
    };
  }

  const pasteCount = Math.max(0, telemetry.pasteCount || (telemetry.pasteEvents?.length ?? 0));
  const pasteDetected = pasteCount > 0;

  // Calculate total pasted characters and words
  let pastedChars = Math.max(0, telemetry.pastedCharactersTotal || 0);
  let pastedWords = Math.max(0, telemetry.pastedWordsTotal || 0);

  if (telemetry.pasteEvents && telemetry.pasteEvents.length > 0) {
    const sumChars = telemetry.pasteEvents.reduce((acc, ev) => acc + (ev.characterCount || 0), 0);
    const sumWords = telemetry.pasteEvents.reduce((acc, ev) => acc + (ev.wordCount || 0), 0);
    pastedChars = Math.max(pastedChars, sumChars);
    pastedWords = Math.max(pastedWords, sumWords);
  }

  // Check for large paste classification
  let hasLargePaste = false;
  if (telemetry.pasteEvents && telemetry.pasteEvents.length > 0) {
    hasLargePaste = telemetry.pasteEvents.some(
      (ev) =>
        ev.characterCount >= PASTE_SIZE_THRESHOLDS.LARGE ||
        ev.wordCount >= PASTE_WORD_THRESHOLDS.LARGE,
    );
  } else if (pastedChars >= PASTE_SIZE_THRESHOLDS.LARGE || pastedWords >= PASTE_WORD_THRESHOLDS.LARGE) {
    hasLargePaste = true;
  }

  // Rapid input evaluation
  const rapidInputCount = Math.max(
    0,
    telemetry.rapidInputCount || (telemetry.rapidInputEvents?.length ?? 0),
  );
  const rapidInputDetected = rapidInputCount > 0;

  // Paste ratio: clamped between 0 and 1
  let pasteRatio = 0;
  if (finalAnswerCharacters > 0 && pastedChars > 0) {
    pasteRatio = Math.min(1, Math.round((pastedChars / finalAnswerCharacters) * 100) / 100);
  } else if (finalAnswerCharacters === 0 && pastedChars > 0) {
    pasteRatio = 1;
  }

  const editCount = Math.max(0, telemetry.editCount || 0);
  const durationMs =
    telemetry.durationMs !== undefined && telemetry.durationMs !== null
      ? Math.max(0, telemetry.durationMs)
      : telemetry.startedAt && telemetry.lastEditedAt
        ? Math.max(0, new Date(telemetry.lastEditedAt).getTime() - new Date(telemetry.startedAt).getTime())
        : null;

  // Build objective signals
  const signals: string[] = [];

  if (hasLargePaste) {
    signals.push("عملیات Paste با حجم بزرگ ثبت شده است.");
  } else if (pasteDetected) {
    signals.push(`تعداد ${toPersianDigits(pasteCount)} عملیات Paste در ورود پاسخ ثبت شده است.`);
  }

  if (rapidInputDetected) {
    signals.push(`تعداد ${toPersianDigits(rapidInputCount)} مورد ورود سریع متن ثبت شده است.`);
  }

  if (pasteRatio >= 0.75 && finalAnswerCharacters > 150) {
    signals.push("بخش عمده پاسخ از طریق عملیات Paste وارد شده است.");
  }

  // Technical Telemetry Inconsistency check:
  // Triggered conservatively when a substantial answer is submitted (>= 150 characters and >= 25 words)
  // but telemetry reports 0 pastes, 0 rapid inputs, and fewer than 3 edits or an implausibly short duration (< 1500ms).
  // This is a neutral signal ("عدم تطابق فنی در داده‌های ثبت‌شده ورود پاسخ") and does NOT claim cheating.
  const telemetryInconsistencyDetected = Boolean(
    (finalAnswerCharacters >= 150 && finalAnswerWords >= 25) &&
      pasteCount === 0 &&
      rapidInputCount === 0 &&
      (editCount < 3 || (durationMs !== null && durationMs < 1500)),
  );

  if (telemetryInconsistencyDetected) {
    signals.push("عدم تطابق فنی در داده‌های ثبت‌شده ورود پاسخ (نیازمند بازبینی استاد).");
  }

  // Recommended review flag is triggered on combined or significant telemetry patterns or inconsistency
  const reviewRecommended =
    hasLargePaste ||
    telemetryInconsistencyDetected ||
    (pasteDetected && pasteRatio >= 0.7 && finalAnswerCharacters >= 200) ||
    (rapidInputDetected && rapidInputCount >= 2 && finalAnswerCharacters >= 200);

  const timeline = Array.isArray(telemetry.timeline) ? telemetry.timeline : [];

  return {
    pasteDetected,
    pasteCount,
    pastedCharactersTotal: pastedChars,
    pastedWordsTotal: pastedWords,
    finalAnswerCharacters,
    finalAnswerWords,
    pasteRatio,
    largePasteDetected: hasLargePaste,
    rapidInputDetected,
    rapidInputCount,
    telemetryInconsistencyDetected,
    editCount,
    durationMs,
    reviewRecommended,
    signals,
    timeline,
  };
}

// ---------------------------------------------------------------------------
// Attempt-Level Anti-Cheating Telemetry & Signals
// ---------------------------------------------------------------------------

export type TeacherExamSecurityEventType =
  | "tab_hidden"
  | "tab_visible"
  | "reconnect";

export interface TeacherExamAttemptSecurityEventInput {
  id: string;
  type: TeacherExamSecurityEventType;
  clientSessionId: string;
  clientTimestamp?: string | null;
}

export interface TeacherExamAttemptSecurityEvent {
  id: string; // Idempotency key / UUID
  type: TeacherExamSecurityEventType;
  serverReceivedAt: string; // ISO 8601 string recorded on server
  clientTimestamp?: string | null;
  clientSessionId: string;
  durationAwayMs?: number | null;
}

export interface ActiveClientSessionInfo {
  clientSessionId: string;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface TeacherExamAttemptIntegrityData {
  tabSwitchCount: number;
  incompleteExitCount: number;
  totalTimeAwayMs: number;
  reconnectCount: number;
  concurrentSessionDetected: boolean;
  activeSessions?: ActiveClientSessionInfo[];
  events: TeacherExamAttemptSecurityEvent[];
  lastExitTimestamp?: string | null;
  lastExitSessionId?: string | null;
  lastEventTimestamp?: string | null;
}

export interface DescriptivePasteQuestionSummary {
  questionId: string;
  orderIndex: number;
  pasteCount: number;
  pastedCharactersTotal: number;
  pastedWordsTotal: number;
  lastPastedAt: string | null;
}

export interface TeacherExamAttemptIntegrityAnalysis {
  tabSwitchCount: number;
  incompleteExitCount: number;
  totalTimeAwayMs: number;
  reconnectCount: number;
  concurrentSessionDetected: boolean;
  totalPasteCount: number;
  pastedQuestionsCount: number;
  descriptivePasteBreakdown: DescriptivePasteQuestionSummary[];
  signals: string[];
  reviewRecommended: boolean;
  hasAnomalies: boolean;
}

/**
 * Pure evaluation function generating objective, non-accusatory signals for an entire attempt.
 */
export function analyzeAttemptIntegrity(
  attemptIntegrity?: TeacherExamAttemptIntegrityData | null,
  descriptivePastes?: DescriptivePasteQuestionSummary[] | null,
): TeacherExamAttemptIntegrityAnalysis {
  const tabSwitchCount = Math.max(0, attemptIntegrity?.tabSwitchCount ?? 0);
  let incompleteExitCount = Math.max(0, attemptIntegrity?.incompleteExitCount ?? 0);
  // If attempt has an unclosed exit at review time, count it as incomplete
  if (attemptIntegrity?.lastExitTimestamp) {
    incompleteExitCount = Math.max(incompleteExitCount, 1);
  }
  const totalTimeAwayMs = Math.max(0, attemptIntegrity?.totalTimeAwayMs ?? 0);
  const reconnectCount = Math.max(0, attemptIntegrity?.reconnectCount ?? 0);
  const concurrentSessionDetected = Boolean(attemptIntegrity?.concurrentSessionDetected);

  const safePastes = Array.isArray(descriptivePastes) ? descriptivePastes : [];
  const totalPasteCount = safePastes.reduce((acc, p) => acc + (p.pasteCount || 0), 0);
  const pastedQuestionsCount = safePastes.filter((p) => (p.pasteCount || 0) > 0).length;

  const signals: string[] = [];

  if (tabSwitchCount > 0) {
    signals.push(`تعداد ${toPersianDigits(tabSwitchCount)} بار خروج از تب یا محیط آزمون ثبت شده است.`);
  }

  if (incompleteExitCount > 0) {
    signals.push(`تعداد ${toPersianDigits(incompleteExitCount)} مورد خروج بدون ثبت زمان بازگشت قطعی ثبت شده است.`);
  }

  if (totalTimeAwayMs >= 1000) {
    const totalSeconds = Math.round(totalTimeAwayMs / 1000);
    if (totalSeconds < 60) {
      signals.push(`مجموع زمان ثبت‌شده خارج از آزمون: حدود ${toPersianDigits(totalSeconds)} ثانیه.`);
    } else {
      const minutes = Math.floor(totalSeconds / 60);
      const remainingSeconds = totalSeconds % 60;
      signals.push(
        `مجموع زمان ثبت‌شده خارج از آزمون: حدود ${toPersianDigits(minutes)} دقیقه${
          remainingSeconds > 0 ? ` و ${toPersianDigits(remainingSeconds)} ثانیه` : ""
        }.`,
      );
    }
  }

  if (reconnectCount > 1) {
    signals.push(`تعداد ${toPersianDigits(reconnectCount)} بار اتصال مجدد یا بارگذاری مجدد صفحه ثبت شده است.`);
  }

  if (concurrentSessionDetected) {
    signals.push("شواهد فعالیت همزمان در بیش از یک تب یا محیط مرورگر در طول آزمون مشاهده شده است.");
  }

  if (totalPasteCount > 0) {
    signals.push(
      `تعداد ${toPersianDigits(totalPasteCount)} عملیات Paste در پاسخ‌های تشریحی (${toPersianDigits(
        pastedQuestionsCount,
      )} سؤال) ثبت شده است.`,
    );
  }

  // Flag review recommendation on notable patterns without alleging cheating
  const reviewRecommended =
    concurrentSessionDetected ||
    (tabSwitchCount >= 3 && totalTimeAwayMs >= 30000) ||
    totalPasteCount >= 3 ||
    (tabSwitchCount >= 5);

  const hasAnomalies =
    tabSwitchCount > 0 ||
    reconnectCount > 1 ||
    concurrentSessionDetected ||
    totalPasteCount > 0;

  return {
    tabSwitchCount,
    incompleteExitCount,
    totalTimeAwayMs,
    reconnectCount,
    concurrentSessionDetected,
    totalPasteCount,
    pastedQuestionsCount,
    descriptivePasteBreakdown: safePastes,
    signals,
    reviewRecommended,
    hasAnomalies,
  };
}

/**
 * Pure state reducer applying a validated security event to attempt integrity data.
 * Enforces server timestamp calculations, idempotency, duplicate suppression, and concurrent session tracking.
 */
export function applySecurityEventToAttemptIntegrity(
  current: TeacherExamAttemptIntegrityData | null | undefined,
  event: {
    id: string;
    type: TeacherExamSecurityEventType;
    clientSessionId: string;
    clientTimestamp?: string | null;
  },
  serverNow: Date = new Date(),
): TeacherExamAttemptIntegrityData {
  const data: TeacherExamAttemptIntegrityData = current
    ? {
        tabSwitchCount: current.tabSwitchCount || 0,
        incompleteExitCount: current.incompleteExitCount || 0,
        totalTimeAwayMs: current.totalTimeAwayMs || 0,
        reconnectCount: current.reconnectCount || 0,
        concurrentSessionDetected: Boolean(current.concurrentSessionDetected),
        activeSessions: Array.isArray(current.activeSessions) ? [...current.activeSessions] : [],
        events: Array.isArray(current.events) ? [...current.events] : [],
        lastExitTimestamp: current.lastExitTimestamp ?? null,
        lastExitSessionId: current.lastExitSessionId ?? null,
        lastEventTimestamp: current.lastEventTimestamp ?? null,
      }
    : {
        tabSwitchCount: 0,
        incompleteExitCount: 0,
        totalTimeAwayMs: 0,
        reconnectCount: 0,
        concurrentSessionDetected: false,
        activeSessions: [],
        events: [],
        lastExitTimestamp: null,
        lastExitSessionId: null,
        lastEventTimestamp: null,
      };

  // Idempotency: Ignore exact duplicate event ID (network retries)
  if (data.events.some((e) => e.id === event.id)) {
    return data;
  }

  const serverIso = serverNow.toISOString();
  let durationAwayMs: number | null = null;

  // Track session activity & recency
  const activeSessions = data.activeSessions || [];
  const existingSessionIndex = activeSessions.findIndex(
    (s) => s.clientSessionId === event.clientSessionId,
  );
  const previousLastSeenAt: string | null =
    existingSessionIndex >= 0 ? activeSessions[existingSessionIndex].lastSeenAt : null;

  if (existingSessionIndex >= 0) {
    activeSessions[existingSessionIndex] = {
      ...activeSessions[existingSessionIndex],
      lastSeenAt: serverIso,
    };
  } else {
    activeSessions.push({
      clientSessionId: event.clientSessionId,
      firstSeenAt: serverIso,
      lastSeenAt: serverIso,
    });
  }

  // Prune sessions inactive for > 5 minutes
  const nowMs = serverNow.getTime();
  const prunedSessions = activeSessions.filter(
    (s) => nowMs - new Date(s.lastSeenAt).getTime() < 300_000,
  );
  data.activeSessions = prunedSessions;

  // Concurrent session detection:
  // Requires at least 2 distinct sessions active within 45s of each other without an exit between them
  if (!data.concurrentSessionDetected && prunedSessions.length > 1) {
    const recentActive = prunedSessions.filter(
      (s) => nowMs - new Date(s.lastSeenAt).getTime() < 45_000,
    );
    if (recentActive.length >= 2) {
      data.concurrentSessionDetected = true;
    }
  }

  if (event.type === "tab_hidden") {
    // If already in a hidden state, don't double count (handles duplicate blur/visibilitychange)
    if (!data.lastExitTimestamp) {
      data.tabSwitchCount += 1;
      data.lastExitTimestamp = serverIso;
      data.lastExitSessionId = event.clientSessionId;
    }
  } else if (event.type === "tab_visible") {
    // Valid return: calculate server-bounded away duration from pending exit
    if (data.lastExitTimestamp) {
      const exitTime = new Date(data.lastExitTimestamp).getTime();
      const rawAway = nowMs - exitTime;
      // Clamp between 0 and 24 hours
      durationAwayMs = Math.max(0, Math.min(86_400_000, rawAway));
      data.totalTimeAwayMs += durationAwayMs;
      data.lastExitTimestamp = null;
      data.lastExitSessionId = null;
    }
    // Note: if visible arrives without a pending hidden (e.g. out of order), no phantom duration is added
  } else if (event.type === "reconnect") {
    // Increment reconnect count only if this is the first session contact
    // or if at least RECONNECT_THROTTLE_WINDOW_MS has elapsed since previous activity on this session.
    // Rapid page refreshes within the throttle window are ignored to avoid artificial count inflation.
    const isNewSession = previousLastSeenAt === null;
    const isPastThrottle =
      previousLastSeenAt !== null &&
      nowMs - new Date(previousLastSeenAt).getTime() >= RECONNECT_THROTTLE_WINDOW_MS;

    if (isNewSession || isPastThrottle) {
      data.reconnectCount += 1;
    }
  }

  data.lastEventTimestamp = serverIso;

  // Append immutable event to events array (capped at 100 to protect storage)
  if (data.events.length < 100) {
    data.events.push({
      id: event.id,
      type: event.type,
      serverReceivedAt: serverIso,
      clientTimestamp: event.clientTimestamp ?? null,
      clientSessionId: event.clientSessionId,
      durationAwayMs,
    });
  }

  return data;
}
