import { describe, it, expect } from "vitest";
import { filterAndDistributeQuestions } from "../study.js";

type TestQuestion = {
  id: string;
  difficulty?: string | null;
  lesson?: { id: string; title: string } | null;
  lessonId?: string | null;
  topic?: string | null;
};

describe("filterAndDistributeQuestions", () => {
  const createMockQuestion = (
    id: string,
    sessionId: string | null,
    difficulty: "easy" | "medium" | "hard" | null = "medium",
  ): TestQuestion => ({
    id,
    difficulty,
    lesson: sessionId ? { id: sessionId, title: `Session ${sessionId}` } : null,
    lessonId: sessionId,
  });

  it("returns all questions when no options or null options provided", () => {
    const questions: TestQuestion[] = [
      createMockQuestion("q1", "s1", "easy"),
      createMockQuestion("q2", "s1", "medium"),
      createMockQuestion("q3", "s2", "hard"),
      createMockQuestion("q4", null, null),
    ];

    expect(filterAndDistributeQuestions(questions)).toEqual(questions);
    expect(filterAndDistributeQuestions(questions, {})).toEqual(questions);
    expect(filterAndDistributeQuestions(questions, { count: null, difficulty: null })).toEqual(questions);
  });

  it("returns all questions when total available is less than or equal to requested count", () => {
    const questions: TestQuestion[] = [
      createMockQuestion("q1", "s1"),
      createMockQuestion("q2", "s2"),
    ];

    expect(filterAndDistributeQuestions(questions, { count: 10 })).toEqual(questions);
    expect(filterAndDistributeQuestions(questions, { count: 2 })).toEqual(questions);
  });

  describe("difficulty filtering", () => {
    const questions: TestQuestion[] = [
      createMockQuestion("q1", "s1", "easy"),
      createMockQuestion("q2", "s1", "easy"),
      createMockQuestion("q3", "s2", "medium"),
      createMockQuestion("q4", "s2", "medium"),
      createMockQuestion("q5", "s3", "hard"),
      createMockQuestion("q6", "s3", null),
    ];

    it("filters strictly by easy difficulty", () => {
      const result = filterAndDistributeQuestions(questions, { difficulty: "easy" });
      expect(result.map((q) => q.id)).toEqual(["q1", "q2"]);
    });

    it("filters strictly by medium difficulty", () => {
      const result = filterAndDistributeQuestions(questions, { difficulty: "medium" });
      expect(result.map((q) => q.id)).toEqual(["q3", "q4"]);
    });

    it("filters strictly by hard difficulty", () => {
      const result = filterAndDistributeQuestions(questions, { difficulty: "hard" });
      expect(result.map((q) => q.id)).toEqual(["q5"]);
    });

    it("does not arbitrarily classify questions without difficulty into any difficulty", () => {
      const resultEasy = filterAndDistributeQuestions(questions, { difficulty: "easy" });
      const resultMed = filterAndDistributeQuestions(questions, { difficulty: "medium" });
      const resultHard = filterAndDistributeQuestions(questions, { difficulty: "hard" });

      expect(resultEasy.some((q) => q.id === "q6")).toBe(false);
      expect(resultMed.some((q) => q.id === "q6")).toBe(false);
      expect(resultHard.some((q) => q.id === "q6")).toBe(false);
    });
  });

  describe("balanced session distribution", () => {
    it("distributes evenly across 4 sessions when enough questions exist", () => {
      // 4 sessions, each with 10 questions (total 40)
      const questions: TestQuestion[] = [];
      for (let s = 1; s <= 4; s++) {
        for (let q = 1; q <= 10; q++) {
          questions.push(createMockQuestion(`s${s}_q${q}`, `s${s}`, "medium"));
        }
      }

      // Request 20 questions -> 5 from each session
      const result = filterAndDistributeQuestions(questions, { count: 20 });
      expect(result).toHaveLength(20);

      const countBySession: Record<string, number> = {};
      for (const q of result) {
        const s = q.lesson!.id;
        countBySession[s] = (countBySession[s] || 0) + 1;
      }

      expect(countBySession).toEqual({
        s1: 5,
        s2: 5,
        s3: 5,
        s4: 5,
      });
    });

    it("spills remaining quota over to other sessions when one session has fewer questions", () => {
      // Session 1 has only 2 questions
      // Sessions 2, 3, 4 have 10 questions each
      const questions: TestQuestion[] = [
        createMockQuestion("s1_q1", "s1", "medium"),
        createMockQuestion("s1_q2", "s1", "medium"),
      ];
      for (let s = 2; s <= 4; s++) {
        for (let q = 1; q <= 10; q++) {
          questions.push(createMockQuestion(`s${s}_q${q}`, `s${s}`, "medium"));
        }
      }

      // Request 20 questions
      // s1 gives 2. Remaining 18 are distributed equally among s2, s3, s4 (6 each)
      const result = filterAndDistributeQuestions(questions, { count: 20 });
      expect(result).toHaveLength(20);

      const countBySession: Record<string, number> = {};
      for (const q of result) {
        const s = q.lesson!.id;
        countBySession[s] = (countBySession[s] || 0) + 1;
      }

      expect(countBySession).toEqual({
        s1: 2,
        s2: 6,
        s3: 6,
        s4: 6,
      });
    });

    it("handles questions without session ID fairly under __unassigned__ rather than dropping them", () => {
      const questions: TestQuestion[] = [
        createMockQuestion("s1_q1", "s1", "medium"),
        createMockQuestion("s1_q2", "s1", "medium"),
        createMockQuestion("un_q1", null, "medium"),
        createMockQuestion("un_q2", null, "medium"),
      ];

      const result = filterAndDistributeQuestions(questions, { count: 2 });
      expect(result).toHaveLength(2);
      // One from s1, one from unassigned
      expect(result.map((q) => q.id)).toEqual(["s1_q1", "un_q1"]);
    });

    it("preserves original relative order of questions and does not produce duplicates", () => {
      const questions: TestQuestion[] = [
        createMockQuestion("q1", "s1"),
        createMockQuestion("q2", "s2"),
        createMockQuestion("q3", "s1"),
        createMockQuestion("q4", "s2"),
        createMockQuestion("q5", "s1"),
        createMockQuestion("q6", "s2"),
      ];

      const result = filterAndDistributeQuestions(questions, { count: 4 });
      expect(result).toHaveLength(4);
      // Ensure no duplicates
      const uniqueIds = new Set(result.map((q) => q.id));
      expect(uniqueIds.size).toBe(4);
      // Ensure relative order matches original
      expect(result.map((q) => q.id)).toEqual(["q1", "q2", "q3", "q4"]);
    });

    it("does not mutate original questions array", () => {
      const questions = Object.freeze([
        createMockQuestion("q1", "s1"),
        createMockQuestion("q2", "s2"),
      ]);

      const copy = [...questions];
      const result = filterAndDistributeQuestions(questions, { count: 1 });
      expect(questions).toEqual(copy);
      expect(result).toHaveLength(1);
    });

    it("is deterministic across multiple runs", () => {
      const questions: TestQuestion[] = [];
      for (let s = 1; s <= 3; s++) {
        for (let q = 1; q <= 8; q++) {
          questions.push(createMockQuestion(`s${s}_q${q}`, `s${s}`));
        }
      }

      const run1 = filterAndDistributeQuestions(questions, { count: 10 });
      const run2 = filterAndDistributeQuestions(questions, { count: 10 });
      expect(run1.map((q) => q.id)).toEqual(run2.map((q) => q.id));
    });
  });

  describe("combined difficulty and count", () => {
    it("filters by difficulty and then balances session distribution strictly within that difficulty", () => {
      const questions: TestQuestion[] = [
        // s1: 3 easy, 3 hard
        createMockQuestion("s1_e1", "s1", "easy"),
        createMockQuestion("s1_e2", "s1", "easy"),
        createMockQuestion("s1_e3", "s1", "easy"),
        createMockQuestion("s1_h1", "s1", "hard"),
        createMockQuestion("s1_h2", "s1", "hard"),
        createMockQuestion("s1_h3", "s1", "hard"),
        // s2: 3 easy, 3 hard
        createMockQuestion("s2_e1", "s2", "easy"),
        createMockQuestion("s2_e2", "s2", "easy"),
        createMockQuestion("s2_e3", "s2", "easy"),
        createMockQuestion("s2_h1", "s2", "hard"),
        createMockQuestion("s2_h2", "s2", "hard"),
        createMockQuestion("s2_h3", "s2", "hard"),
      ];

      // Request 4 easy questions -> 2 from s1, 2 from s2
      const result = filterAndDistributeQuestions(questions, { difficulty: "easy", count: 4 });
      expect(result.map((q) => q.id)).toEqual(["s1_e1", "s1_e2", "s2_e1", "s2_e2"]);
      expect(result.every((q) => q.difficulty === "easy")).toBe(true);
    });

    it("does not backfill from other difficulties when eligible questions are fewer than count", () => {
      const questions: TestQuestion[] = [
        createMockQuestion("q1", "s1", "hard"),
        createMockQuestion("q2", "s1", "hard"),
        createMockQuestion("q3", "s2", "easy"),
        createMockQuestion("q4", "s2", "medium"),
      ];

      // Request 10 hard questions, only 2 exist
      const result = filterAndDistributeQuestions(questions, { difficulty: "hard", count: 10 });
      expect(result.map((q) => q.id)).toEqual(["q1", "q2"]);
      expect(result.every((q) => q.difficulty === "hard")).toBe(true);
    });
  });
});
