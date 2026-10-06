import { describe, it, expect } from "vitest";
import {
  analyzeDescriptiveAnswerIntegrity,
  analyzeAttemptIntegrity,
  applySecurityEventToAttemptIntegrity,
  countWords,
  type DescriptiveAnswerIntegrityData,
} from "./integrity.js";

describe("Descriptive Answer Integrity Domain Logic", () => {
  describe("countWords helper", () => {
    it("handles empty or whitespace strings", () => {
      expect(countWords("")).toBe(0);
      expect(countWords("   \n\t  ")).toBe(0);
      expect(countWords(null)).toBe(0);
      expect(countWords(undefined)).toBe(0);
    });

    it("correctly counts Persian and English words", () => {
      expect(countWords("داروهای بتابلوکر")).toBe(2);
      expect(countWords("یک دو سه چهار پنج")).toBe(5);
      expect(countWords("Pharmacokinetics and pharmacodynamics study")).toBe(4);
    });
  });

  describe("analyzeDescriptiveAnswerIntegrity", () => {
    it("Scenario 1: Normal typing without paste (pasteDetected = false, rapidInputDetected = false)", () => {
      const text = "این یک پاسخ تشریحی معمولی است که با دست تایپ شده است.";
      const telemetry: DescriptiveAnswerIntegrityData = {
        startedAt: "2026-10-01T10:00:00.000Z",
        lastEditedAt: "2026-10-01T10:05:00.000Z",
        durationMs: 300000,
        editCount: 15,
        pasteCount: 0,
        pastedCharactersTotal: 0,
        pastedWordsTotal: 0,
        rapidInputCount: 0,
        rapidInputCharactersTotal: 0,
        rapidInputWordsTotal: 0,
        timeline: [
          { type: "start", timestamp: "2026-10-01T10:00:00.000Z" },
          { type: "typing", timestamp: "2026-10-01T10:01:00.000Z", characterDelta: 20 },
          { type: "edit", timestamp: "2026-10-01T10:03:00.000Z", characterDelta: 33 },
        ],
      };

      const result = analyzeDescriptiveAnswerIntegrity(text, telemetry);
      expect(result.pasteDetected).toBe(false);
      expect(result.pasteCount).toBe(0);
      expect(result.pastedCharactersTotal).toBe(0);
      expect(result.pasteRatio).toBe(0);
      expect(result.largePasteDetected).toBe(false);
      expect(result.rapidInputDetected).toBe(false);
      expect(result.editCount).toBe(15);
      expect(result.reviewRecommended).toBe(false);
      expect(result.timeline.length).toBe(3);
    });

    it("Scenario 2: Small 2-word Paste (pasteDetected = true, largePasteDetected = false)", () => {
      const text = "نام دارو: پروپرانولول هیدروکلراید می‌باشد.";
      const telemetry: DescriptiveAnswerIntegrityData = {
        startedAt: "2026-10-01T10:00:00.000Z",
        lastEditedAt: "2026-10-01T10:01:00.000Z",
        durationMs: 60000,
        editCount: 3,
        pasteCount: 1,
        pastedCharactersTotal: 23,
        pastedWordsTotal: 2,
        rapidInputCount: 0,
        rapidInputCharactersTotal: 0,
        rapidInputWordsTotal: 0,
        pasteEvents: [
          {
            timestamp: "2026-10-01T10:00:30.000Z",
            characterCount: 23,
            wordCount: 2,
            cursorPosition: 9,
          },
        ],
      };

      const result = analyzeDescriptiveAnswerIntegrity(text, telemetry);
      expect(result.pasteDetected).toBe(true);
      expect(result.pasteCount).toBe(1);
      expect(result.pastedCharactersTotal).toBe(23);
      expect(result.pastedWordsTotal).toBe(2);
      expect(result.largePasteDetected).toBe(false);
      expect(result.reviewRecommended).toBe(false); // Small 2-word paste does not trigger alarm
    });

    it("Scenario 3: Large Paste (largePasteDetected = true, reviewRecommended = true)", () => {
      const largeText = "ا".repeat(950);
      const telemetry: DescriptiveAnswerIntegrityData = {
        startedAt: "2026-10-01T10:00:00.000Z",
        lastEditedAt: "2026-10-01T10:00:05.000Z",
        durationMs: 5000,
        editCount: 1,
        pasteCount: 1,
        pastedCharactersTotal: 950,
        pastedWordsTotal: 180,
        rapidInputCount: 0,
        rapidInputCharactersTotal: 0,
        rapidInputWordsTotal: 0,
        pasteEvents: [
          {
            timestamp: "2026-10-01T10:00:03.000Z",
            characterCount: 950,
            wordCount: 180,
            cursorPosition: 0,
          },
        ],
      };

      const result = analyzeDescriptiveAnswerIntegrity(largeText, telemetry);
      expect(result.pasteDetected).toBe(true);
      expect(result.largePasteDetected).toBe(true);
      expect(result.pasteRatio).toBe(1);
      expect(result.reviewRecommended).toBe(true);
      expect(result.signals).toContain("عملیات Paste با حجم بزرگ ثبت شده است.");
    });

    it("Scenario 4: Multiple Pastes (pasteCount & character sum accurate)", () => {
      const text = "بخش اول متن بخش دوم متن بخش سوم متن";
      const telemetry: DescriptiveAnswerIntegrityData = {
        startedAt: "2026-10-01T10:00:00.000Z",
        lastEditedAt: "2026-10-01T10:02:00.000Z",
        durationMs: 120000,
        editCount: 5,
        pasteCount: 3,
        pastedCharactersTotal: 35,
        pastedWordsTotal: 7,
        rapidInputCount: 0,
        rapidInputCharactersTotal: 0,
        rapidInputWordsTotal: 0,
        pasteEvents: [
          { timestamp: "2026-10-01T10:00:10.000Z", characterCount: 12, wordCount: 3 },
          { timestamp: "2026-10-01T10:00:40.000Z", characterCount: 11, wordCount: 2 },
          { timestamp: "2026-10-01T10:01:20.000Z", characterCount: 12, wordCount: 2 },
        ],
      };

      const result = analyzeDescriptiveAnswerIntegrity(text, telemetry);
      expect(result.pasteDetected).toBe(true);
      expect(result.pasteCount).toBe(3);
      expect(result.pastedCharactersTotal).toBe(35);
      expect(result.pastedWordsTotal).toBe(7);
      expect(result.largePasteDetected).toBe(false);
    });

    it("Scenario 5: Combined Typing + Paste (pasteRatio calculated accurately)", () => {
      // 50 chars typed, 50 chars pasted => total 100 chars => ratio 0.50
      const text = "بخش تایپ‌شده توسط دانشجو ".repeat(2) + "بخش پیست‌شده ".repeat(2);
      const telemetry: DescriptiveAnswerIntegrityData = {
        startedAt: "2026-10-01T10:00:00.000Z",
        durationMs: 60000,
        editCount: 8,
        pasteCount: 1,
        pastedCharactersTotal: 26,
        pastedWordsTotal: 4,
        rapidInputCount: 0,
        rapidInputCharactersTotal: 0,
        rapidInputWordsTotal: 0,
      };

      const result = analyzeDescriptiveAnswerIntegrity(text, telemetry);
      expect(result.pasteDetected).toBe(true);
      expect(result.finalAnswerCharacters).toBe(text.length);
      expect(result.pasteRatio).toBeCloseTo(26 / text.length, 2);
    });

    it("Scenario 6: Paste then Delete (pastedCharactersTotal and finalAnswerCharacters are distinct)", () => {
      // Student pasted 1000 chars, then deleted 800 chars, leaving 200 chars
      const text = "باقی‌مانده متن پاسخ بعد از حذف ویرایشی.";
      const telemetry: DescriptiveAnswerIntegrityData = {
        startedAt: "2026-10-01T10:00:00.000Z",
        durationMs: 180000,
        editCount: 12,
        pasteCount: 1,
        pastedCharactersTotal: 1000,
        pastedWordsTotal: 200,
        rapidInputCount: 0,
        rapidInputCharactersTotal: 0,
        rapidInputWordsTotal: 0,
        pasteEvents: [
          { timestamp: "2026-10-01T10:00:05.000Z", characterCount: 1000, wordCount: 200 },
        ],
      };

      const result = analyzeDescriptiveAnswerIntegrity(text, telemetry);
      expect(result.pasteDetected).toBe(true);
      expect(result.pastedCharactersTotal).toBe(1000);
      expect(result.finalAnswerCharacters).toBe(text.length);
      // pasteRatio is clamped at 1.0
      expect(result.pasteRatio).toBe(1);
    });

    it("Scenario 7: Rapid Input Detection without browser paste event", () => {
      const text = "متن طولانی که با سرعت بسیار بالا در یک بازه زمانی کوتاه وارد شده است.";
      const telemetry: DescriptiveAnswerIntegrityData = {
        startedAt: "2026-10-01T10:00:00.000Z",
        durationMs: 2000,
        editCount: 2,
        pasteCount: 0,
        pastedCharactersTotal: 0,
        pastedWordsTotal: 0,
        rapidInputCount: 1,
        rapidInputCharactersTotal: 70,
        rapidInputWordsTotal: 14,
        rapidInputEvents: [
          {
            timestamp: "2026-10-01T10:00:01.000Z",
            characterCount: 70,
            wordCount: 14,
            durationMs: 800,
            charactersPerSecond: 87.5,
            wordsPerSecond: 17.5,
          },
        ],
      };

      const result = analyzeDescriptiveAnswerIntegrity(text, telemetry);
      expect(result.pasteDetected).toBe(false);
      expect(result.rapidInputDetected).toBe(true);
      expect(result.rapidInputCount).toBe(1);
      expect(result.signals).toContain("تعداد ۱ مورد ورود سریع متن ثبت شده است.");
    });

    it("Scenario 8: Null / Undefined telemetry (graceful fallback)", () => {
      const result = analyzeDescriptiveAnswerIntegrity("پاسخ تشریحی بدون تله‌متری", null);
      expect(result.pasteDetected).toBe(false);
      expect(result.pasteCount).toBe(0);
      expect(result.rapidInputDetected).toBe(false);
      expect(result.editCount).toBe(0);
      expect(result.reviewRecommended).toBe(false);
      expect(result.signals).toEqual([]);
      expect(result.timeline).toEqual([]);
    });

    it("Scenario 9: Empty text answer (no crash, safe 0 calculations)", () => {
      const telemetry: DescriptiveAnswerIntegrityData = {
        startedAt: "2026-10-01T10:00:00.000Z",
        durationMs: 1000,
        editCount: 0,
        pasteCount: 0,
        pastedCharactersTotal: 0,
        pastedWordsTotal: 0,
        rapidInputCount: 0,
        rapidInputCharactersTotal: 0,
        rapidInputWordsTotal: 0,
      };

      const result = analyzeDescriptiveAnswerIntegrity("", telemetry);
      expect(result.finalAnswerCharacters).toBe(0);
      expect(result.finalAnswerWords).toBe(0);
      expect(result.pasteRatio).toBe(0);
      expect(result.reviewRecommended).toBe(false);
    });

    it("Scenario 10: Negative/Invalid values in telemetry (clamped gracefully)", () => {
      const telemetry: DescriptiveAnswerIntegrityData = {
        startedAt: "2026-10-01T10:00:00.000Z",
        durationMs: -500,
        editCount: -3,
        pasteCount: -1,
        pastedCharactersTotal: -100,
        pastedWordsTotal: -20,
        rapidInputCount: -2,
        rapidInputCharactersTotal: -50,
        rapidInputWordsTotal: -10,
      };

      const result = analyzeDescriptiveAnswerIntegrity("متن تست", telemetry);
      expect(result.pasteDetected).toBe(false);
      expect(result.pasteCount).toBe(0);
      expect(result.pastedCharactersTotal).toBe(0);
      expect(result.rapidInputDetected).toBe(false);
      expect(result.editCount).toBe(0);
      expect(result.durationMs).toBe(0);
    });
  });

  describe("Attempt-Level Integrity Logic (Security Events & Non-Accusatory Analysis)", () => {
    describe("applySecurityEventToAttemptIntegrity", () => {
      it("handles normal tab_hidden and tab_visible cycle with server duration calculation", () => {
        const t1 = new Date("2026-10-06T10:00:00.000Z");
        const s1 = applySecurityEventToAttemptIntegrity(
          null,
          { id: "ev-1", type: "tab_hidden", clientSessionId: "tab-A" },
          t1,
        );
        expect(s1.tabSwitchCount).toBe(1);
        expect(s1.lastExitTimestamp).toBe("2026-10-06T10:00:00.000Z");
        expect(s1.totalTimeAwayMs).toBe(0);

        // 15 seconds later, tab returns
        const t2 = new Date("2026-10-06T10:00:15.000Z");
        const s2 = applySecurityEventToAttemptIntegrity(
          s1,
          { id: "ev-2", type: "tab_visible", clientSessionId: "tab-A" },
          t2,
        );
        expect(s2.tabSwitchCount).toBe(1);
        expect(s2.totalTimeAwayMs).toBe(15000);
        expect(s2.lastExitTimestamp).toBeNull();
      });

      it("suppresses duplicate tab_hidden events (blur + visibilitychange idempotency)", () => {
        const t1 = new Date("2026-10-06T10:00:00.000Z");
        const s1 = applySecurityEventToAttemptIntegrity(
          null,
          { id: "ev-1", type: "tab_hidden", clientSessionId: "tab-A" },
          t1,
        );
        // Duplicate hidden event right after
        const s2 = applySecurityEventToAttemptIntegrity(
          s1,
          { id: "ev-2", type: "tab_hidden", clientSessionId: "tab-A" },
          new Date("2026-10-06T10:00:00.100Z"),
        );
        // Count remains 1, not 2
        expect(s2.tabSwitchCount).toBe(1);
      });

      it("ignores out-of-order or duplicate tab_visible without pending exit", () => {
        const s = applySecurityEventToAttemptIntegrity(
          null,
          { id: "ev-orphan-vis", type: "tab_visible", clientSessionId: "tab-A" },
          new Date(),
        );
        expect(s.totalTimeAwayMs).toBe(0);
        expect(s.tabSwitchCount).toBe(0);
      });

      it("deduplicates identical event IDs on network retry", () => {
        const t1 = new Date("2026-10-06T10:00:00.000Z");
        const s1 = applySecurityEventToAttemptIntegrity(
          null,
          { id: "ev-retry-1", type: "tab_hidden", clientSessionId: "tab-A" },
          t1,
        );
        const s2 = applySecurityEventToAttemptIntegrity(
          s1,
          { id: "ev-retry-1", type: "tab_hidden", clientSessionId: "tab-A" },
          new Date("2026-10-06T10:00:01.000Z"),
        );
        expect(s2.events.length).toBe(1);
      });

      it("detects concurrent active sessions when two tabs produce overlapping events", () => {
        const t1 = new Date("2026-10-06T10:00:00.000Z");
        const s1 = applySecurityEventToAttemptIntegrity(
          null,
          { id: "ev-tab1", type: "reconnect", clientSessionId: "session-TAB-1" },
          t1,
        );
        expect(s1.concurrentSessionDetected).toBe(false);

        // 10s later, another tab produces an event
        const t2 = new Date("2026-10-06T10:00:10.000Z");
        const s2 = applySecurityEventToAttemptIntegrity(
          s1,
          { id: "ev-tab2", type: "reconnect", clientSessionId: "session-TAB-2" },
          t2,
        );
        expect(s2.concurrentSessionDetected).toBe(true);
      });

      it("does not flag normal single-tab refresh as concurrent session", () => {
        const t1 = new Date("2026-10-06T10:00:00.000Z");
        const s1 = applySecurityEventToAttemptIntegrity(
          null,
          { id: "ev-ref-1", type: "reconnect", clientSessionId: "session-SAME-TAB" },
          t1,
        );
        // Refresh page in same tab retains sessionStorage clientSessionId
        const t2 = new Date("2026-10-06T10:00:20.000Z");
        const s2 = applySecurityEventToAttemptIntegrity(
          s1,
          { id: "ev-ref-2", type: "reconnect", clientSessionId: "session-SAME-TAB" },
          t2,
        );
        expect(s2.concurrentSessionDetected).toBe(false);
      });

      it("throttles rapid reconnects within RECONNECT_THROTTLE_WINDOW_MS for the same session", () => {
        const t1 = new Date("2026-10-06T10:00:00.000Z");
        const s1 = applySecurityEventToAttemptIntegrity(
          null,
          { id: "ev-rec-1", type: "reconnect", clientSessionId: "session-RAPID" },
          t1,
        );
        expect(s1.reconnectCount).toBe(1);

        // Rapid reload 5 seconds later (within 15s window) -> reconnectCount should NOT increment
        const t2 = new Date("2026-10-06T10:00:05.000Z");
        const s2 = applySecurityEventToAttemptIntegrity(
          s1,
          { id: "ev-rec-2", type: "reconnect", clientSessionId: "session-RAPID" },
          t2,
        );
        expect(s2.reconnectCount).toBe(1);

        // Reload 20 seconds later (past 15s window) -> reconnectCount SHOULD increment
        const t3 = new Date("2026-10-06T10:00:25.000Z");
        const s3 = applySecurityEventToAttemptIntegrity(
          s2,
          { id: "ev-rec-3", type: "reconnect", clientSessionId: "session-RAPID" },
          t3,
        );
        expect(s3.reconnectCount).toBe(2);
      });
    });

    describe("analyzeDescriptiveAnswerIntegrity Inconsistency Checks", () => {
      it("detects technical inconsistency when large answer is submitted with zero paste/rapid input and minimal edits", () => {
        const longAnswer =
          "این یک پاسخ تشریحی مفصل و بسیار طولانی در رابطه با عملکرد سیستم‌های عصبی و انتقال پیام‌های سیناپسی است که شامل واژگان تخصصی متعدد و جملات کامل علمی می‌باشد.";
        const fakeTelemetry: DescriptiveAnswerIntegrityData = {
          startedAt: "2026-10-06T10:00:00.000Z",
          lastEditedAt: "2026-10-06T10:00:01.000Z",
          durationMs: 1000,
          editCount: 1,
          pasteCount: 0,
          pastedCharactersTotal: 0,
          pastedWordsTotal: 0,
          rapidInputCount: 0,
          rapidInputCharactersTotal: 0,
          rapidInputWordsTotal: 0,
        };

        const result = analyzeDescriptiveAnswerIntegrity(longAnswer, fakeTelemetry);
        expect(result.telemetryInconsistencyDetected).toBe(true);
        expect(result.reviewRecommended).toBe(true);
        expect(result.signals).toContain(
          "عدم تطابق فنی در داده‌های ثبت‌شده ورود پاسخ (نیازمند بازبینی استاد).",
        );
        // Ensure non-accusatory phrasing
        expect(result.signals.join(" ")).not.toContain("تقلب قطعی");
      });

      it("does not flag legitimate typing with adequate edits as inconsistency", () => {
        const legitAnswer =
          "این یک پاسخ تشریحی مفصل و بسیار طولانی در رابطه با عملکرد سیستم‌های عصبی و انتقال پیام‌های سیناپسی است که شامل واژگان تخصصی متعدد و جملات کامل علمی می‌باشد.";
        const legitTelemetry: DescriptiveAnswerIntegrityData = {
          startedAt: "2026-10-06T10:00:00.000Z",
          lastEditedAt: "2026-10-06T10:05:00.000Z",
          durationMs: 300000,
          editCount: 85,
          pasteCount: 0,
          pastedCharactersTotal: 0,
          pastedWordsTotal: 0,
          rapidInputCount: 0,
          rapidInputCharactersTotal: 0,
          rapidInputWordsTotal: 0,
        };

        const result = analyzeDescriptiveAnswerIntegrity(legitAnswer, legitTelemetry);
        expect(result.telemetryInconsistencyDetected).toBe(false);
      });
    });

    describe("analyzeAttemptIntegrity", () => {
      it("gracefully falls back on null or empty integrity data", () => {
        const analysis = analyzeAttemptIntegrity(null, null);
        expect(analysis.tabSwitchCount).toBe(0);
        expect(analysis.incompleteExitCount).toBe(0);
        expect(analysis.totalTimeAwayMs).toBe(0);
        expect(analysis.reconnectCount).toBe(0);
        expect(analysis.concurrentSessionDetected).toBe(false);
        expect(analysis.totalPasteCount).toBe(0);
        expect(analysis.signals).toHaveLength(0);
        expect(analysis.reviewRecommended).toBe(false);
        expect(analysis.hasAnomalies).toBe(false);
      });

      it("generates objective, non-accusatory signals for exits and paste breakdown", () => {
        const analysis = analyzeAttemptIntegrity(
          {
            tabSwitchCount: 2,
            incompleteExitCount: 1,
            totalTimeAwayMs: 45000,
            reconnectCount: 3,
            concurrentSessionDetected: true,
            events: [],
          },
          [
            {
              questionId: "q-1",
              orderIndex: 1,
              pasteCount: 2,
              pastedCharactersTotal: 120,
              pastedWordsTotal: 25,
              lastPastedAt: "2026-10-06T10:15:00.000Z",
            },
          ],
        );

        expect(analysis.tabSwitchCount).toBe(2);
        expect(analysis.incompleteExitCount).toBe(1);
        expect(analysis.reconnectCount).toBe(3);
        expect(analysis.concurrentSessionDetected).toBe(true);
        expect(analysis.totalPasteCount).toBe(2);
        expect(analysis.reviewRecommended).toBe(true);
        expect(analysis.signals.length).toBeGreaterThanOrEqual(4);

        // Check non-accusatory phrasing
        const joined = analysis.signals.join(" ");
        expect(joined).toContain("خروج از تب یا محیط آزمون");
        expect(joined).toContain("خروج بدون ثبت زمان بازگشت قطعی");
        expect(joined).toContain("شواهد فعالیت همزمان");
        expect(joined).not.toContain("تقلب قطعی");
        expect(joined).not.toContain("دانشجو تقلب کرده");
      });
    });
  });
});
