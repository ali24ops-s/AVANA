import { describe, it, expect, beforeEach } from "vitest";
import type { Actor, CourseId, LessonId, UserId } from "@avana/domain";
import { defaultPolicy, DomainError } from "@avana/domain";
import { StudyService } from "../modules/study/study-service.js";
import {
  InMemoryFlashcardStore,
  InMemoryFlashcardReviewStore,
  InMemoryQuizStore,
  InMemoryQuizQuestionStore,
  InMemoryQuizAttemptStore,
  InMemoryStudySessionStore,
} from "../modules/study/test/in-memory-stores.js";
import {
  InMemoryModuleStore,
  InMemoryLessonStore,
  InMemoryProgressStore,
} from "../modules/learning/test/in-memory-stores.js";
import { InMemoryCourseStore } from "../modules/courses/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import { InMemorySessionStore, InMemoryUserStore } from "../modules/identity/test/in-memory-stores.js";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { v1Routes } from "../routes/v1.js";

describe("Study Sessions & Active Study Time Tracking", () => {
  let userStore: InMemoryUserStore;
  let sessionStore: InMemorySessionStore;
  let organizationStore: InMemoryOrganizationStore;
  let courseStore: InMemoryCourseStore;
  let moduleStore: InMemoryModuleStore;
  let lessonStore: InMemoryLessonStore;
  let progressStore: InMemoryProgressStore;
  let flashcardStore: InMemoryFlashcardStore;
  let flashcardReviewStore: InMemoryFlashcardReviewStore;
  let quizStore: InMemoryQuizStore;
  let quizQuestionStore: InMemoryQuizQuestionStore;
  let quizAttemptStore: InMemoryQuizAttemptStore;
  let studySessionStore: InMemoryStudySessionStore;
  let studyService: StudyService;

  const actor: Actor = {
    userId: "user-123" as UserId,
    role: "student",
  };

  beforeEach(() => {
    userStore = new InMemoryUserStore();
    sessionStore = new InMemorySessionStore();
    organizationStore = new InMemoryOrganizationStore();
    courseStore = new InMemoryCourseStore();
    moduleStore = new InMemoryModuleStore();
    lessonStore = new InMemoryLessonStore();
    progressStore = new InMemoryProgressStore();
    flashcardStore = new InMemoryFlashcardStore();
    flashcardReviewStore = new InMemoryFlashcardReviewStore();
    quizStore = new InMemoryQuizStore();
    quizQuestionStore = new InMemoryQuizQuestionStore();
    quizAttemptStore = new InMemoryQuizAttemptStore(quizStore);
    studySessionStore = new InMemoryStudySessionStore();

    studyService = new StudyService(
      flashcardStore,
      flashcardReviewStore,
      quizStore,
      quizQuestionStore,
      quizAttemptStore,
      moduleStore,
      lessonStore,
      progressStore,
      defaultPolicy,
      undefined,
      organizationStore,
      undefined,
      courseStore,
      undefined,
      studySessionStore,
    );
  });

  describe("Service Layer", () => {
    it("starts a new educational session and finalizes any open previous session", async () => {
      // Start session 1 (lesson)
      const session1 = await studyService.startStudySession(actor, {
        activityType: "lesson",
        courseId: "course-1" as CourseId,
        lessonId: "lesson-1" as LessonId,
      });

      expect(session1.id).toBeDefined();
      expect(session1.activityType).toBe("lesson");
      expect(session1.endedAt).toBeNull();
      expect(session1.durationSeconds).toBe(0);

      // Start session 2 (flashcard) -> should close session 1 automatically
      const session2 = await studyService.startStudySession(actor, {
        activityType: "flashcard",
        courseId: "course-1" as CourseId,
      });

      const updatedSession1 = await studySessionStore.findById(session1.id);
      expect(updatedSession1?.endedAt).not.toBeNull();
      expect(session2.endedAt).toBeNull();
      expect(session2.activityType).toBe("flashcard");
    });

    it("rejects invalid activity types", async () => {
      await expect(
        studyService.startStudySession(actor, {
          activityType: "invalid_activity" as any,
        }),
      ).rejects.toThrow();
    });

    it("records heartbeats and caps duration increments by MAX_HEARTBEAT_GAP_SECONDS", async () => {
      const session = await studyService.startStudySession(actor, {
        activityType: "exam",
      });

      // Simulate lastActivityAt was 25 seconds ago
      const twentyFiveSecAgo = new Date(Date.now() - 25 * 1000).toISOString();
      await studySessionStore.update({
        ...session,
        lastActivityAt: twentyFiveSecAgo,
      });

      const heartbeatRes = await studyService.recordHeartbeat(actor, session.id);
      expect(heartbeatRes.durationSeconds).toBe(25);

      // Simulate a 90 second gap (within 120s idle timeout) -> should be capped at 60s max gap
      const ninetySecAgo = new Date(Date.now() - 90 * 1000).toISOString();
      await studySessionStore.update({
        ...session,
        durationSeconds: 25,
        lastActivityAt: ninetySecAgo,
      });

      const heartbeatRes2 = await studyService.recordHeartbeat(actor, session.id);
      // 25 + capped 60 = 85
      expect(heartbeatRes2.durationSeconds).toBe(85);
    });

    it("ignores idle periods greater than IDLE_TIMEOUT_SECONDS (> 120s)", async () => {
      const session = await studyService.startStudySession(actor, {
        activityType: "lesson",
      });

      // Set duration to 100 and simulate user left tab open for 10 minutes (600s)
      const tenMinutesAgo = new Date(Date.now() - 600 * 1000).toISOString();
      await studySessionStore.update({
        ...session,
        durationSeconds: 100,
        lastActivityAt: tenMinutesAgo,
      });

      // Heartbeat arrives after returning from 10 min idle -> 0 seconds added
      const heartbeatRes = await studyService.recordHeartbeat(actor, session.id);
      expect(heartbeatRes.durationSeconds).toBe(100);
    });

    it("ends an active session cleanly", async () => {
      const session = await studyService.startStudySession(actor, {
        activityType: "ai_tutor",
      });

      // Simulate 15s elapsed
      const fifteenSecAgo = new Date(Date.now() - 15 * 1000).toISOString();
      await studySessionStore.update({
        ...session,
        lastActivityAt: fifteenSecAgo,
      });

      const endRes = await studyService.endStudySession(actor, session.id);
      expect(endRes.endedAt).not.toBeNull();
      expect(endRes.durationSeconds).toBe(15);

      // Ending again is idempotent and returns existing ended session
      const endRes2 = await studyService.endStudySession(actor, session.id);
      expect(endRes2.durationSeconds).toBe(15);
    });

    it("prevents users from mutating other users' study sessions", async () => {
      const otherActor: Actor = { userId: "other-user" as UserId, role: "student" };
      const session = await studyService.startStudySession(actor, {
        activityType: "lesson",
      });

      await expect(
        studyService.recordHeartbeat(otherActor, session.id),
      ).rejects.toThrow(DomainError);

      await expect(
        studyService.endStudySession(otherActor, session.id),
      ).rejects.toThrow(DomainError);
    });
  });

  describe("HTTP Routes Integration", () => {
    it("handles start -> heartbeat -> end -> summary flow over HTTP", async () => {
      const config = loadApiConfig();
      const app = createApp({ config });
      await app.register(v1Routes, {
        config,
        sessionStore,
        userStore,
        organizationStore,
        courseStore,
        moduleStore,
        lessonStore,
        progressStore,
        flashcardStore,
        flashcardReviewStore,
        quizStore,
        quizQuestionStore,
        quizAttemptStore,
        studySessionStore,
      });

      const registerRes = await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "student@avana.ai",
          password: "password123",
          name: "Student User",
        }),
      });

      expect(registerRes.statusCode).toBe(200);
      const cookie = registerRes.cookies.find((c) => c.name === "avana_session");
      const sessionCookie = `avana_session=${cookie?.value}`;

      const authHeaders = {
        cookie: sessionCookie,
      };

      // 1. Start session
      const startRes = await app.inject({
        method: "POST",
        url: "/v1/study-sessions/start",
        headers: authHeaders,
        payload: {
          activityType: "lesson",
        },
      });

      expect(startRes.statusCode).toBe(201);
      const startJson = JSON.parse(startRes.payload);
      expect(startJson.session.id).toBeDefined();
      const sessionId = startJson.session.id;

      // 2. Send heartbeat
      const hbRes = await app.inject({
        method: "POST",
        url: "/v1/study-sessions/heartbeat",
        headers: authHeaders,
        payload: {
          sessionId,
        },
      });
      expect(hbRes.statusCode).toBe(200);
      const hbJson = JSON.parse(hbRes.payload);
      expect(hbJson.sessionId).toBe(sessionId);

      // 3. End session
      const endRes = await app.inject({
        method: "POST",
        url: "/v1/study-sessions/end",
        headers: authHeaders,
        payload: {
          sessionId,
        },
      });
      expect(endRes.statusCode).toBe(200);
      const endJson = JSON.parse(endRes.payload);
      expect(endJson.endedAt).toBeDefined();

      // 4. Get weekly dashboard study time
      const summaryRes = await app.inject({
        method: "GET",
        url: "/v1/dashboard/study-time?timezone=Asia/Tehran",
        headers: authHeaders,
      });
      expect(summaryRes.statusCode).toBe(200);
      const summaryJson = JSON.parse(summaryRes.payload);
      expect(summaryJson.thisWeek).toBeDefined();
      expect(summaryJson.thisWeek.formatted).toBeDefined();
      expect(summaryJson.daily).toHaveLength(7);
      expect(summaryJson.stats).toBeDefined();
      expect(summaryJson.stats.completedLessons).toBe(0);
      expect(summaryJson.stats.completedExams).toBe(0);

      // 5. Get dashboard stats endpoint
      const statsRes = await app.inject({
        method: "GET",
        url: "/v1/dashboard/stats?timezone=Asia/Tehran",
        headers: authHeaders,
      });
      expect(statsRes.statusCode).toBe(200);
      const statsJson = JSON.parse(statsRes.payload);
      expect(statsJson.stats.completedLessons).toBe(0);
      expect(statsJson.stats.completedExams).toBe(0);
      expect(statsJson.stats.currentStreak).toBe(0);
      expect(statsJson.thisWeek).toBeDefined();
    });

    it("aggregates completed lessons, completed exams, and streak for authenticated user", async () => {
      // 1. Seed completed lessons for actor (2 unique lessons)
      progressStore.insert({
        id: "lp-1",
        userId: actor.userId,
        lessonId: "les-1" as LessonId,
        completed: true,
        completedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      progressStore.insert({
        id: "lp-2",
        userId: actor.userId,
        lessonId: "les-2" as LessonId,
        completed: true,
        completedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      // Incomplete lesson (should not count)
      progressStore.insert({
        id: "lp-3",
        userId: actor.userId,
        lessonId: "les-3" as LessonId,
        completed: false,
        completedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      // Completed lesson by another user (should not count)
      progressStore.insert({
        id: "lp-4",
        userId: "other-user" as UserId,
        lessonId: "les-4" as LessonId,
        completed: true,
        completedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // 2. Seed completed exams for actor (3 completed, 1 in_progress, 1 for other user)
      quizAttemptStore.insert({
        id: "qa-1",
        quizId: "quiz-1" as any,
        userId: actor.userId,
        score: 90,
        answers: {},
        status: "completed",
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      });
      quizAttemptStore.insert({
        id: "qa-2",
        quizId: "quiz-2" as any,
        userId: actor.userId,
        score: 85,
        answers: {},
        status: "completed",
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      });
      quizAttemptStore.insert({
        id: "qa-3",
        quizId: "quiz-3" as any,
        userId: actor.userId,
        score: 100,
        answers: {},
        status: "completed",
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      });
      // Incomplete attempt (should not count)
      quizAttemptStore.insert({
        id: "qa-4",
        quizId: "quiz-4" as any,
        userId: actor.userId,
        score: 0,
        answers: {},
        status: "in_progress",
        startedAt: new Date().toISOString(),
        completedAt: null,
      });
      // Completed attempt by another user (should not count)
      quizAttemptStore.insert({
        id: "qa-5",
        quizId: "quiz-5" as any,
        userId: "other-user" as UserId,
        score: 100,
        answers: {},
        status: "completed",
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      });

      // 3. Seed study sessions for streak: 300s (5m) today
      studySessionStore.insert({
        id: "sess-1",
        userId: actor.userId,
        activityType: "lesson",
        startedAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
        durationSeconds: 360, // 6 minutes
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const stats = await studyService.getDashboardStats(actor, "Asia/Tehran");
      expect(stats.stats.completedLessons).toBe(2);
      expect(stats.stats.completedExams).toBe(3);
      expect(stats.stats.currentStreak).toBe(1);
      expect(stats.stats.longestStreak).toBe(1);
      expect(stats.stats.todayIsActive).toBe(true);
      expect(stats.stats.todayStudySeconds).toBe(360);
    });

    it("counts repeated completions of the same lesson only once (unique per user+lesson)", async () => {
      // Re-completing / upserting lesson 1 multiple times
      await progressStore.upsert({
        id: "lp-dup",
        userId: actor.userId,
        lessonId: "les-dup" as LessonId,
        completed: true,
        completedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await progressStore.upsert({
        id: "lp-dup",
        userId: actor.userId,
        lessonId: "les-dup" as LessonId,
        completed: true,
        completedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const count = await progressStore.countCompletedByUser(actor.userId);
      expect(count).toBe(1);
    });

    it("rejects unauthenticated requests to dashboard stats with 401", async () => {
      const config = loadApiConfig();
      const testApp = createApp({ config });
      await testApp.register(v1Routes, {
        config,
        sessionStore,
        userStore,
        organizationStore,
        courseStore,
        moduleStore,
        lessonStore,
        progressStore,
        flashcardStore,
        flashcardReviewStore,
        quizStore,
        quizQuestionStore,
        quizAttemptStore,
        studySessionStore,
      });

      const res = await testApp.inject({
        method: "GET",
        url: "/v1/dashboard/stats",
      });
      expect(res.statusCode).toBe(401);
    });
  });
});
