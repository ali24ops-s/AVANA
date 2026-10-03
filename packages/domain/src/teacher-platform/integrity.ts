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

  // Recommended review flag is triggered only on combined or significant telemetry patterns
  const reviewRecommended =
    hasLargePaste ||
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
    editCount,
    durationMs,
    reviewRecommended,
    signals,
    timeline,
  };
}
