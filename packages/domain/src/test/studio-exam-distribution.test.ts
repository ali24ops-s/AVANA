import { describe, it, expect } from "vitest";
import {
  distributeQuestionQuotas,
  filterExecutableTasks,
  splitQuotaIntoBatches,
  allocateQuestionPatterns,
  deriveOperationStatus,
  deriveTaskStatus,
  MAX_TOTAL_QUESTIONS,
  MIN_TOTAL_QUESTIONS,
  MAX_BATCH_SIZE,
  type StudioExamPatternSnapshot,
} from "../studio-exam-generation.js";
import { DomainError } from "../errors.js";

describe("Studio Exam Generation — Distribution & Batching Algorithms", () => {
  describe("distributeQuestionQuotas", () => {
    it("1. handles one chapter and one question (یک فصل و یک سؤال)", () => {
      const result = distributeQuestionQuotas(1, ["mod-1"]);
      expect(result).toEqual([{ moduleId: "mod-1", quota: 1 }]);
      expect(result.reduce((acc, curr) => acc + curr.quota, 0)).toBe(1);
    });

    it("2. handles one chapter and 100 questions (یک فصل و ۱۰۰ سؤال)", () => {
      const result = distributeQuestionQuotas(100, ["mod-1"]);
      expect(result).toEqual([{ moduleId: "mod-1", quota: 100 }]);
      expect(result.reduce((acc, curr) => acc + curr.quota, 0)).toBe(100);
    });

    it("3. handles four chapters and 100 questions evenly: 25, 25, 25, 25 (چهار فصل و ۱۰۰ سؤال)", () => {
      const moduleIds = ["mod-1", "mod-2", "mod-3", "mod-4"];
      const result = distributeQuestionQuotas(100, moduleIds);
      expect(result).toEqual([
        { moduleId: "mod-1", quota: 25 },
        { moduleId: "mod-2", quota: 25 },
        { moduleId: "mod-3", quota: 25 },
        { moduleId: "mod-4", quota: 25 },
      ]);
      expect(result.reduce((acc, curr) => acc + curr.quota, 0)).toBe(100);
    });

    it("4. handles three chapters and 100 questions: 34, 33, 33 (سه فصل و ۱۰۰ سؤال)", () => {
      const moduleIds = ["mod-1", "mod-2", "mod-3"];
      const result = distributeQuestionQuotas(100, moduleIds);
      expect(result).toEqual([
        { moduleId: "mod-1", quota: 34 },
        { moduleId: "mod-2", quota: 33 },
        { moduleId: "mod-3", quota: 33 },
      ]);
      expect(result.reduce((acc, curr) => acc + curr.quota, 0)).toBe(100);
    });

    it("5. handles six chapters and 50 questions: 9, 9, 8, 8, 8, 8 (شش فصل و ۵۰ سؤال)", () => {
      const moduleIds = ["mod-1", "mod-2", "mod-3", "mod-4", "mod-5", "mod-6"];
      const result = distributeQuestionQuotas(50, moduleIds);
      expect(result).toEqual([
        { moduleId: "mod-1", quota: 9 },
        { moduleId: "mod-2", quota: 9 },
        { moduleId: "mod-3", quota: 8 },
        { moduleId: "mod-4", quota: 8 },
        { moduleId: "mod-5", quota: 8 },
        { moduleId: "mod-6", quota: 8 },
      ]);
      expect(result.reduce((acc, curr) => acc + curr.quota, 0)).toBe(50);
    });

    it("6. handles more chapters than questions (تعداد فصل بیشتر از تعداد سؤال)", () => {
      const moduleIds = ["mod-1", "mod-2", "mod-3", "mod-4", "mod-5"];
      const result = distributeQuestionQuotas(3, moduleIds);
      expect(result).toEqual([
        { moduleId: "mod-1", quota: 1 },
        { moduleId: "mod-2", quota: 1 },
        { moduleId: "mod-3", quota: 1 },
        { moduleId: "mod-4", quota: 0 },
        { moduleId: "mod-5", quota: 0 },
      ]);
      expect(result.reduce((acc, curr) => acc + curr.quota, 0)).toBe(3);
    });

    it("7. rejects zero question count (ورودی صفر)", () => {
      expect(() => distributeQuestionQuotas(0, ["mod-1"])).toThrowError(DomainError);
      expect(() => distributeQuestionQuotas(0, ["mod-1"])).toThrowError(
        /تعداد کل سؤالات نمی‌تواند کمتر از ۱ باشد/
      );
    });

    it("8. rejects negative question count (تعداد منفی)", () => {
      expect(() => distributeQuestionQuotas(-5, ["mod-1"])).toThrowError(DomainError);
      expect(() => distributeQuestionQuotas(-5, ["mod-1"])).toThrowError(
        /تعداد کل سؤالات نمی‌تواند کمتر از ۱ باشد/
      );
    });

    it("9. rejects question count above 100 (تعداد بیشتر از ۱۰۰)", () => {
      expect(() => distributeQuestionQuotas(101, ["mod-1"])).toThrowError(DomainError);
      expect(() => distributeQuestionQuotas(101, ["mod-1"])).toThrowError(
        /تعداد کل سؤالات نمی‌تواند بیشتر از ۱۰۰ باشد/
      );
      expect(() => distributeQuestionQuotas(500, ["mod-1"])).toThrowError(DomainError);
    });

    it("10. rejects empty chapters array (آرایه خالی فصل‌ها)", () => {
      expect(() => distributeQuestionQuotas(50, [])).toThrowError(DomainError);
      expect(() => distributeQuestionQuotas(50, [])).toThrowError(
        /حداقل باید یک فصل برای تولید سؤال انتخاب شود/
      );
    });

    it("11. rejects duplicate chapter IDs (عدم تکرار شناسه فصل‌ها)", () => {
      const duplicateIds = ["mod-1", "mod-2", "mod-1"];
      expect(() => distributeQuestionQuotas(30, duplicateIds)).toThrowError(DomainError);
      expect(() => distributeQuestionQuotas(30, duplicateIds)).toThrowError(
        /شناسه فصل تکراری در درخواست وجود دارد: mod-1/
      );
    });

    it("12. rejects empty or invalid module ID strings", () => {
      expect(() => distributeQuestionQuotas(10, ["mod-1", "   "])).toThrowError(DomainError);
      expect(() => distributeQuestionQuotas(10, ["mod-1", "   "])).toThrowError(
        /شناسه فصل در ردیف ۲ نامعتبر است/
      );
    });

    it("13. rejects non-integer question counts", () => {
      expect(() => distributeQuestionQuotas(25.5, ["mod-1"])).toThrowError(DomainError);
      expect(() => distributeQuestionQuotas(NaN, ["mod-1"])).toThrowError(DomainError);
    });

    it("14. strictly guarantees exact sum property across all combinations (مجموع دقیق سهمیه‌ها)", () => {
      for (let total = MIN_TOTAL_QUESTIONS; total <= MAX_TOTAL_QUESTIONS; total += 7) {
        for (let chapterCount = 1; chapterCount <= 12; chapterCount++) {
          const moduleIds = Array.from({ length: chapterCount }, (_, i) => `chapter-${i + 1}`);
          const result = distributeQuestionQuotas(total, moduleIds);
          const sum = result.reduce((acc, curr) => acc + curr.quota, 0);
          expect(sum).toBe(total);
          expect(result.length).toBe(chapterCount);
        }
      }
    });
  });

  describe("splitQuotaIntoBatches", () => {
    it("1. splits 25 questions into [10, 10, 5]", () => {
      const batches = splitQuotaIntoBatches(25);
      expect(batches).toEqual([10, 10, 5]);
      expect(batches.reduce((a, b) => a + b, 0)).toBe(25);
    });

    it("2. splits 34 questions into [10, 10, 10, 4]", () => {
      const batches = splitQuotaIntoBatches(34);
      expect(batches).toEqual([10, 10, 10, 4]);
      expect(batches.reduce((a, b) => a + b, 0)).toBe(34);
    });

    it("3. handles exact multiples of 10: 10 -> [10], 20 -> [10, 10]", () => {
      expect(splitQuotaIntoBatches(10)).toEqual([10]);
      expect(splitQuotaIntoBatches(20)).toEqual([10, 10]);
      expect(splitQuotaIntoBatches(100)).toEqual([10, 10, 10, 10, 10, 10, 10, 10, 10, 10]);
    });

    it("4. handles small counts < 10: 1 -> [1], 7 -> [7]", () => {
      expect(splitQuotaIntoBatches(1)).toEqual([1]);
      expect(splitQuotaIntoBatches(7)).toEqual([7]);
    });

    it("5. handles 0 target count gracefully with empty array", () => {
      expect(splitQuotaIntoBatches(0)).toEqual([]);
    });

    it("6. rejects negative count", () => {
      expect(() => splitQuotaIntoBatches(-1)).toThrowError(DomainError);
      expect(() => splitQuotaIntoBatches(-1)).toThrowError(/سهمیه سؤالات فصل نمی‌تواند منفی باشد/);
    });

    it("7. rejects non-integer target count", () => {
      expect(() => splitQuotaIntoBatches(15.5)).toThrowError(DomainError);
    });

    it("8. enforces maximum 10 questions per batch (حداکثر ۱۰ سؤال در هر Batch)", () => {
      const batches = splitQuotaIntoBatches(100);
      for (const b of batches) {
        expect(b).toBeLessThanOrEqual(MAX_BATCH_SIZE);
        expect(b).toBeGreaterThan(0);
      }
    });

    it("9. rejects invalid maxBatchSize outside 1..10", () => {
      expect(() => splitQuotaIntoBatches(20, 15)).toThrowError(DomainError);
      expect(() => splitQuotaIntoBatches(20, 0)).toThrowError(DomainError);
    });
  });

  describe("deriveOperationStatus & deriveTaskStatus", () => {
    it("derives completed when all tasks completed", () => {
      expect(deriveOperationStatus(["completed", "completed", "completed"])).toBe("completed");
    });

    it("derives pending when all tasks pending", () => {
      expect(deriveOperationStatus(["pending", "pending"])).toBe("pending");
      expect(deriveOperationStatus([])).toBe("pending");
    });

    it("derives processing when any task is processing", () => {
      expect(deriveOperationStatus(["completed", "processing", "pending"])).toBe("processing");
      expect(deriveOperationStatus(["pending", "processing"])).toBe("processing");
    });

    it("derives processing when some tasks completed but others still pending", () => {
      expect(deriveOperationStatus(["completed", "pending"])).toBe("processing");
    });

    it("derives partial when all finished and there is a mix of success and failure", () => {
      expect(deriveOperationStatus(["completed", "failed"])).toBe("partial");
      expect(deriveOperationStatus(["completed", "partial"])).toBe("partial");
      expect(deriveOperationStatus(["completed", "insufficient_content"])).toBe("partial");
      expect(deriveOperationStatus(["partial", "failed"])).toBe("partial");
    });

    it("derives failed when all finished tasks failed or had insufficient content", () => {
      expect(deriveOperationStatus(["failed", "failed"])).toBe("failed");
      expect(deriveOperationStatus(["failed", "insufficient_content"])).toBe("failed");
      expect(deriveOperationStatus(["insufficient_content"])).toBe("failed");
    });

    it("derives task status correctly based on batches and counts", () => {
      // Completed
      expect(
        deriveTaskStatus({
          batchStatuses: ["completed", "completed"],
          targetCount: 20,
          generatedCount: 20,
        })
      ).toBe("completed");

      // Insufficient content override
      expect(
        deriveTaskStatus({
          batchStatuses: [],
          targetCount: 20,
          generatedCount: 0,
          insufficientContent: true,
        })
      ).toBe("insufficient_content");

      // Processing
      expect(
        deriveTaskStatus({
          batchStatuses: ["completed", "processing"],
          targetCount: 20,
          generatedCount: 10,
        })
      ).toBe("processing");

      // Partial (all finished, but count < target)
      expect(
        deriveTaskStatus({
          batchStatuses: ["completed", "failed"],
          targetCount: 20,
          generatedCount: 10,
        })
      ).toBe("partial");

      // Failed (all finished, generatedCount == 0)
      expect(
        deriveTaskStatus({
          batchStatuses: ["failed", "failed"],
          targetCount: 20,
          generatedCount: 0,
        })
      ).toBe("failed");

      // Cancelled without output
      expect(
        deriveTaskStatus({
          batchStatuses: ["cancelled", "cancelled"],
          targetCount: 20,
          generatedCount: 0,
        })
      ).toBe("cancelled");

      // Cancelled with partial successful output
      expect(
        deriveTaskStatus({
          batchStatuses: ["completed", "cancelled"],
          targetCount: 20,
          generatedCount: 10,
        })
      ).toBe("partial");

      // Zero-quota task immediately resolves as completed
      expect(
        deriveTaskStatus({
          batchStatuses: [],
          targetCount: 0,
          generatedCount: 0,
        })
      ).toBe("completed");
    });

    it("derives cancelled and partial operation status correctly based on task cancellations", () => {
      // All tasks cancelled with zero outputs
      expect(deriveOperationStatus(["cancelled", "cancelled"])).toBe("cancelled");

      // Some completed, some cancelled -> partial
      expect(deriveOperationStatus(["completed", "cancelled"])).toBe("partial");

      // Some partial, some cancelled -> partial
      expect(deriveOperationStatus(["partial", "cancelled"])).toBe("partial");

      // Mixed cancelled and failed with no completed -> cancelled
      expect(deriveOperationStatus(["cancelled", "failed"])).toBe("cancelled");
    });
  });

  describe("filterExecutableTasks & Zero-Quota Handling", () => {
    it("1. filters out chapters with zero quota, retaining only executable tasks", () => {
      const allocations = [
        { moduleId: "mod-1", quota: 2 },
        { moduleId: "mod-2", quota: 0 },
        { moduleId: "mod-3", quota: 1 },
        { moduleId: "mod-4", quota: 0 },
      ];

      const executable = filterExecutableTasks(allocations);
      expect(executable).toEqual([
        { moduleId: "mod-1", quota: 2 },
        { moduleId: "mod-3", quota: 1 },
      ]);
      expect(executable.every((t) => t.quota >= 1)).toBe(true);
    });

    it("2. handles 3 questions across 5 chapters (more chapters than questions)", () => {
      const quotas = distributeQuestionQuotas(3, [
        "ch-1",
        "ch-2",
        "ch-3",
        "ch-4",
        "ch-5",
      ]);

      expect(quotas).toEqual([
        { moduleId: "ch-1", quota: 1 },
        { moduleId: "ch-2", quota: 1 },
        { moduleId: "ch-3", quota: 1 },
        { moduleId: "ch-4", quota: 0 },
        { moduleId: "ch-5", quota: 0 },
      ]);

      const executable = filterExecutableTasks(quotas);
      expect(executable).toHaveLength(3);
      expect(executable.map((e) => e.moduleId)).toEqual(["ch-1", "ch-2", "ch-3"]);
      expect(executable.reduce((sum, e) => sum + e.quota, 0)).toBe(3);
    });

    it("3. handles 1 question across 4 chapters", () => {
      const quotas = distributeQuestionQuotas(1, ["ch-1", "ch-2", "ch-3", "ch-4"]);
      expect(quotas).toEqual([
        { moduleId: "ch-1", quota: 1 },
        { moduleId: "ch-2", quota: 0 },
        { moduleId: "ch-3", quota: 0 },
        { moduleId: "ch-4", quota: 0 },
      ]);

      const executable = filterExecutableTasks(quotas);
      expect(executable).toHaveLength(1);
      expect(executable[0]).toEqual({ moduleId: "ch-1", quota: 1 });
    });

    it("4. handles all positive quotas without omitting any", () => {
      const quotas = distributeQuestionQuotas(10, ["ch-1", "ch-2"]);
      const executable = filterExecutableTasks(quotas);
      expect(executable).toHaveLength(2);
      expect(executable).toEqual(quotas);
    });
  });

  describe("allocateQuestionPatterns", () => {
    const patternA: StudioExamPatternSnapshot = {
      patternId: "pat-a",
      title: "مفهومی",
      patternVersion: 1,
      skills: ["analysis"],
      systemInstructions: "generate conceptual question",
      examples: [],
    };
    const patternB: StudioExamPatternSnapshot = {
      patternId: "pat-b",
      title: "کاربردی",
      patternVersion: 2,
      skills: ["application"],
      systemInstructions: "generate applied question",
      examples: [],
    };
    const patternC: StudioExamPatternSnapshot = {
      patternId: "pat-c",
      title: "مسئله",
      patternVersion: 1,
      skills: ["problem-solving"],
      systemInstructions: "generate problem question",
      examples: [],
    };

    it("1. allocates single pattern deterministically to all question slots (1..N)", () => {
      const assignments = allocateQuestionPatterns({
        targetCount: 4,
        patternSnapshots: [patternA],
      });

      expect(assignments).toEqual([
        { questionIndex: 1, patternId: "pat-a", patternVersion: 1 },
        { questionIndex: 2, patternId: "pat-a", patternVersion: 1 },
        { questionIndex: 3, patternId: "pat-a", patternVersion: 1 },
        { questionIndex: 4, patternId: "pat-a", patternVersion: 1 },
      ]);
    });

    it("2. allocates two patterns in balanced round-robin order", () => {
      const assignments = allocateQuestionPatterns({
        targetCount: 5,
        patternSnapshots: [patternA, patternB],
      });

      expect(assignments).toEqual([
        { questionIndex: 1, patternId: "pat-a", patternVersion: 1 },
        { questionIndex: 2, patternId: "pat-b", patternVersion: 2 },
        { questionIndex: 3, patternId: "pat-a", patternVersion: 1 },
        { questionIndex: 4, patternId: "pat-b", patternVersion: 2 },
        { questionIndex: 5, patternId: "pat-a", patternVersion: 1 },
      ]);
    });

    it("3. preserves patternVersion faithfully from snapshot", () => {
      const assignments = allocateQuestionPatterns({
        targetCount: 3,
        patternSnapshots: [patternB, patternC],
      });

      expect(assignments[0].patternVersion).toBe(2);
      expect(assignments[1].patternVersion).toBe(1);
      expect(assignments[2].patternVersion).toBe(2);
    });

    it("4. supports startIndex offset for continuous distribution across batches", () => {
      // Batch 1 (3 questions, offset 0): pat-a, pat-b, pat-c
      const batch1 = allocateQuestionPatterns({
        targetCount: 3,
        patternSnapshots: [patternA, patternB, patternC],
        startIndex: 0,
      });
      expect(batch1.map((p) => p.patternId)).toEqual(["pat-a", "pat-b", "pat-c"]);

      // Batch 2 (2 questions, offset 3): pat-a, pat-b
      const batch2 = allocateQuestionPatterns({
        targetCount: 2,
        patternSnapshots: [patternA, patternB, patternC],
        startIndex: 3,
      });
      expect(batch2.map((p) => p.patternId)).toEqual(["pat-a", "pat-b"]);
      expect(batch2[0].questionIndex).toBe(1);
      expect(batch2[1].questionIndex).toBe(2);
    });

    it("5. returns empty array if patternSnapshots is empty or targetCount <= 0", () => {
      expect(
        allocateQuestionPatterns({
          targetCount: 5,
          patternSnapshots: [],
        })
      ).toEqual([]);

      expect(
        allocateQuestionPatterns({
          targetCount: 0,
          patternSnapshots: [patternA],
        })
      ).toEqual([]);

      expect(
        allocateQuestionPatterns({
          targetCount: -2,
          patternSnapshots: [patternA],
        })
      ).toEqual([]);
    });
  });
});
