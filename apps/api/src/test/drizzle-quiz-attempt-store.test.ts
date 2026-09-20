import { describe, expect, it, vi } from "vitest";
import { DrizzleQuizAttemptStore } from "../modules/study/drizzle-stores.js";
import type { QuizAttemptRecord } from "../modules/study/test/in-memory-stores.js";

describe("DrizzleQuizAttemptStore Invariant Unit Tests", () => {
  it("update preserves completedAt = null and status = 'in_progress' when saving in-progress answers", async () => {
    let capturedSetPayload: Record<string, unknown> = {};

    const mockDb = {
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockImplementation((payload) => {
          capturedSetPayload = payload;
          return {
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([
                {
                  id: "attempt-uuid-1",
                  quizId: null,
                  userId: "user-1",
                  score: "0",
                  answers: { "q-1": "choice-a" },
                  questionIds: ["q-1"],
                  questionSnapshot: [],
                  metrics: { elapsedSeconds: 60 },
                  topic: "داروهای قلب",
                  difficulty: "medium",
                  status: payload.status,
                  startedAt: new Date("2026-09-20T00:00:00.000Z"),
                  completedAt: payload.completedAt,
                },
              ]),
            }),
          };
        }),
      }),
    };

    const store = new DrizzleQuizAttemptStore(mockDb as any);

    const inProgressAttempt: QuizAttemptRecord = {
      id: "attempt-uuid-1" as any,
      quizId: null,
      userId: "user-1" as any,
      score: 0,
      answers: { "q-1": "choice-a" },
      questionIds: ["q-1" as any],
      questionSnapshot: [],
      metrics: { elapsedSeconds: 60 },
      topic: "داروهای قلب",
      difficulty: "medium",
      status: "in_progress",
      startedAt: "2026-09-20T00:00:00.000Z",
      completedAt: null,
    };

    const updated = await store.update(inProgressAttempt);

    expect(capturedSetPayload.status).toBe("in_progress");
    expect(capturedSetPayload.completedAt).toBeNull();
    expect(updated.status).toBe("in_progress");
    expect(updated.completedAt).toBeNull();
  });

  it("update correctly sets completedAt when completing an attempt", async () => {
    let capturedSetPayload: Record<string, unknown> = {};
    const completionTimestamp = "2026-09-20T00:15:00.000Z";

    const mockDb = {
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockImplementation((payload) => {
          capturedSetPayload = payload;
          return {
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([
                {
                  id: "attempt-uuid-1",
                  quizId: null,
                  userId: "user-1",
                  score: "100",
                  answers: { "q-1": "choice-a" },
                  questionIds: ["q-1"],
                  questionSnapshot: [],
                  metrics: { elapsedSeconds: 900 },
                  topic: "داروهای قلب",
                  difficulty: "medium",
                  status: payload.status,
                  startedAt: new Date("2026-09-20T00:00:00.000Z"),
                  completedAt: payload.completedAt,
                },
              ]),
            }),
          };
        }),
      }),
    };

    const store = new DrizzleQuizAttemptStore(mockDb as any);

    const completedAttempt: QuizAttemptRecord = {
      id: "attempt-uuid-1" as any,
      quizId: null,
      userId: "user-1" as any,
      score: 100,
      answers: { "q-1": "choice-a" },
      questionIds: ["q-1" as any],
      questionSnapshot: [],
      metrics: { elapsedSeconds: 900 },
      topic: "داروهای قلب",
      difficulty: "medium",
      status: "completed",
      startedAt: "2026-09-20T00:00:00.000Z",
      completedAt: completionTimestamp,
    };

    const updated = await store.update(completedAttempt);

    expect(capturedSetPayload.status).toBe("completed");
    expect(capturedSetPayload.completedAt).toEqual(new Date(completionTimestamp));
    expect(updated.status).toBe("completed");
    expect(updated.completedAt).toBe(completionTimestamp);
  });
});
