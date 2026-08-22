/**
 * useStudySessionTracker Hook
 *
 * Tracks real active learning educational activities (lessons, flashcards, exams, AI tutor)
 * without idle background tab counting.
 *
 * Core Behaviors:
 * 1. Starts session on mount / target activity change (POST /v1/study-sessions/start).
 * 2. Listens to lightweight interaction events to keep user marked as active.
 * 3. Sends heartbeats every 30s while active and tab is visible.
 * 4. Pauses heartbeats when tab is hidden or user is idle (> 2 minutes).
 * 5. Automatically finalizes session on unmount or navigation change.
 * 6. Best-effort unload beacon cleanup.
 */

import { useEffect, useRef } from "react";
import { createApiClient, getApiBaseUrl } from "../lib/api/client.js";
import { createStudyApi } from "../lib/api/study.js";

export interface UseStudySessionTrackerOptions {
  activityType: "lesson" | "flashcard" | "exam" | "ai_tutor" | "pdf";
  courseId?: string | null;
  moduleId?: string | null;
  lessonId?: string | null;
  enabled?: boolean;
}

const HEARTBEAT_INTERVAL_MS = 30_000;
const IDLE_THRESHOLD_MS = 120_000; // 2 minutes

export function useStudySessionTracker({
  activityType,
  courseId,
  moduleId,
  lessonId,
  enabled = true,
}: UseStudySessionTrackerOptions): void {
  const sessionIdRef = useRef<string | null>(null);
  const lastInteractionTimeRef = useRef<number>(Date.now());
  const studyApiRef = useRef(createStudyApi(createApiClient({ baseUrl: getApiBaseUrl() })));

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let isMounted = true;
    const studyApi = studyApiRef.current;
    lastInteractionTimeRef.current = Date.now();

    // 1. Start session on server
    const startSession = async () => {
      try {
        const res = await studyApi.startStudySession({
          activityType,
          courseId: courseId || undefined,
          moduleId: moduleId || undefined,
          lessonId: lessonId || undefined,
        });

        if (isMounted) {
          sessionIdRef.current = res.session.id;
        } else {
          // Component unmounted while start was in-flight; end immediately
          void studyApi.endStudySession(res.session.id).catch(() => {});
        }
      } catch {
        // Silently catch network or initialization failures
      }
    };

    void startSession();

    // 2. User interaction listener (resets idle countdown)
    let lastThrottledTime = 0;
    const handleUserInteraction = () => {
      const now = Date.now();
      if (now - lastThrottledTime > 2000) {
        lastThrottledTime = now;
        lastInteractionTimeRef.current = now;
      }
    };

    const interactionEvents: Array<keyof WindowEventMap> = [
      "mousemove",
      "mousedown",
      "keydown",
      "scroll",
      "touchstart",
      "click",
    ];

    if (typeof window !== "undefined") {
      interactionEvents.forEach((ev) => {
        window.addEventListener(ev, handleUserInteraction, { passive: true });
      });
    }

    // 3. Heartbeat loop
    const heartbeatTimer = setInterval(() => {
      const currentSessionId = sessionIdRef.current;
      if (!currentSessionId) return;

      // Skip heartbeat if tab is in background (visibility hidden)
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }

      // Check if user was active within idle timeout (2 minutes)
      const now = Date.now();
      const elapsedSinceInteraction = now - lastInteractionTimeRef.current;
      if (elapsedSinceInteraction > IDLE_THRESHOLD_MS) {
        // User has been idle (> 2 min); do not send heartbeat
        return;
      }

      // User is active, send heartbeat
      void studyApi.heartbeatStudySession(currentSessionId).catch(() => {});
    }, HEARTBEAT_INTERVAL_MS);

    // 4. Tab visibility change listener
    const handleVisibilityChange = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        lastInteractionTimeRef.current = Date.now();
        const currentSessionId = sessionIdRef.current;
        if (currentSessionId) {
          void studyApi.heartbeatStudySession(currentSessionId).catch(() => {});
        }
      }
    };

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }

    // 5. Best-effort beacon cleanup on browser tab close / reload
    const handleBeforeUnload = () => {
      const currentSessionId = sessionIdRef.current;
      if (currentSessionId && typeof navigator !== "undefined" && navigator.sendBeacon) {
        const url = `${getApiBaseUrl()}/v1/study-sessions/end`;
        const blob = new Blob(
          [JSON.stringify({ sessionId: currentSessionId })],
          { type: "application/json" },
        );
        navigator.sendBeacon(url, blob);
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", handleBeforeUnload);
    }

    // 6. Cleanup on unmount or dependency change
    return () => {
      isMounted = false;
      clearInterval(heartbeatTimer);

      if (typeof window !== "undefined") {
        interactionEvents.forEach((ev) => {
          window.removeEventListener(ev, handleUserInteraction);
        });
        window.removeEventListener("beforeunload", handleBeforeUnload);
      }

      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }

      const activeSessionId = sessionIdRef.current;
      if (activeSessionId) {
        sessionIdRef.current = null;
        void studyApi.endStudySession(activeSessionId).catch(() => {});
      }
    };
  }, [activityType, courseId, moduleId, lessonId, enabled]);
}
