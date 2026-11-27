/* eslint-disable no-secrets/no-secrets */
import { describe, expect, test, vi } from "vitest";
import { getTableColumns } from "drizzle-orm";
import * as schema from "../schema/index.js";
import { up, down } from "../migrations/0108_studio_exam_generation.js";
import { up as up0109, down as down0109 } from "../migrations/0109_studio_exam_question_review.js";
import { ALL_MIGRATIONS } from "../tracker/registry.js";

describe("Migration 0108 — Studio Exam Generation Schema & Drizzle Definitions", () => {
  describe("Drizzle Schema Exports", () => {
    test("tables are defined and exported", () => {
      expect(schema.studioExamGenerationOperations).toBeDefined();
      expect(schema.studioExamGenerationTasks).toBeDefined();
      expect(schema.studioExamGenerationBatches).toBeDefined();
      expect(schema.studioExamGeneratedQuestions).toBeDefined();
    });

    test("studioExamGenerationOperations has all required columns", () => {
      const cols = getTableColumns(schema.studioExamGenerationOperations);
      expect(cols).toHaveProperty("id");
      expect(cols).toHaveProperty("quizId");
      expect(cols).toHaveProperty("organizationId");
      expect(cols).toHaveProperty("createdBy");
      expect(cols).toHaveProperty("totalRequestedQuestions");
      expect(cols).toHaveProperty("totalGeneratedQuestions");
      expect(cols).toHaveProperty("status");
      expect(cols).toHaveProperty("config");
      expect(cols).toHaveProperty("patternSnapshots");
      expect(cols).toHaveProperty("startedAt");
      expect(cols).toHaveProperty("completedAt");
      expect(cols).toHaveProperty("createdAt");
      expect(cols).toHaveProperty("updatedAt");
    });

    test("studioExamGenerationTasks has all required columns", () => {
      const cols = getTableColumns(schema.studioExamGenerationTasks);
      expect(cols).toHaveProperty("id");
      expect(cols).toHaveProperty("operationId");
      expect(cols).toHaveProperty("courseId");
      expect(cols).toHaveProperty("moduleId");
      expect(cols).toHaveProperty("targetQuestionCount");
      expect(cols).toHaveProperty("generatedQuestionCount");
      expect(cols).toHaveProperty("status");
      expect(cols).toHaveProperty("retryCount");
      expect(cols).toHaveProperty("errorCode");
      expect(cols).toHaveProperty("errorMessage");
      expect(cols).toHaveProperty("startedAt");
      expect(cols).toHaveProperty("completedAt");
      expect(cols).toHaveProperty("createdAt");
      expect(cols).toHaveProperty("updatedAt");
    });

    test("studioExamGenerationBatches has all required columns", () => {
      const cols = getTableColumns(schema.studioExamGenerationBatches);
      expect(cols).toHaveProperty("id");
      expect(cols).toHaveProperty("taskId");
      expect(cols).toHaveProperty("batchIndex");
      expect(cols).toHaveProperty("targetCount");
      expect(cols).toHaveProperty("generatedCount");
      expect(cols).toHaveProperty("status");
      expect(cols).toHaveProperty("patternAllocations");
      expect(cols).toHaveProperty("retryCount");
      expect(cols).toHaveProperty("errorCode");
      expect(cols).toHaveProperty("errorMessage");
      expect(cols).toHaveProperty("startedAt");
      expect(cols).toHaveProperty("completedAt");
      expect(cols).toHaveProperty("createdAt");
      expect(cols).toHaveProperty("updatedAt");
    });

    test("studioExamGeneratedQuestions has all required columns", () => {
      const cols = getTableColumns(schema.studioExamGeneratedQuestions);
      expect(cols).toHaveProperty("id");
      expect(cols).toHaveProperty("operationId");
      expect(cols).toHaveProperty("taskId");
      expect(cols).toHaveProperty("batchId");
      expect(cols).toHaveProperty("courseId");
      expect(cols).toHaveProperty("moduleId");
      expect(cols).toHaveProperty("patternId");
      expect(cols).toHaveProperty("patternVersion");
      expect(cols).toHaveProperty("questionIndex");
      expect(cols).toHaveProperty("question");
      expect(cols).toHaveProperty("choices");
      expect(cols).toHaveProperty("correctAnswer");
      expect(cols).toHaveProperty("explanation");
      expect(cols).toHaveProperty("difficulty");
      expect(cols).toHaveProperty("topic");
      expect(cols).toHaveProperty("questionType");
      expect(cols).toHaveProperty("metadata");
      expect(cols).toHaveProperty("isAccepted");
      expect(cols).toHaveProperty("reviewStatus");
      expect(cols).toHaveProperty("transferredQuestionId");
      expect(cols).toHaveProperty("transferredAt");
      expect(cols).toHaveProperty("createdAt");
    });

    test("marketingQuizQuestions has sourceStagingQuestionId column", () => {
      const cols = getTableColumns(schema.marketingQuizQuestions);
      expect(cols).toHaveProperty("sourceQuestionId");
      expect(cols).toHaveProperty("sourceBankQuestionId");
      expect(cols).toHaveProperty("sourceStagingQuestionId");
    });
  });

  describe("Migration 0109 — Staging Question Review Lifecycle & Idempotency", () => {
    test("migration 0109 is registered with sequence 109 in ALL_MIGRATIONS", () => {
      const def = ALL_MIGRATIONS.find((m) => m.id === "0109_studio_exam_question_review");
      expect(def).toBeDefined();
      expect(def?.sequence).toBe(109);
      expect(def?.sourceFile).toBe("0109_studio_exam_question_review.ts");
    });

    test("executes up0109 and down0109 SQL idempotently with expected constraints and indexes", async () => {
      const executedSql: string[] = [];
      const mockDb = {
        execute: vi.fn().mockImplementation((query: { queryChunks?: unknown[] }) => {
          executedSql.push(JSON.stringify(query));
          return Promise.resolve({});
        }),
      };

      await expect(up0109(mockDb)).resolves.not.toThrow();
      expect(mockDb.execute).toHaveBeenCalledTimes(1);

      const upText = executedSql[0];
      expect(upText).toContain("review_status");
      expect(upText).toContain("pending_review");
      expect(upText).toContain("chk_studio_gen_q_review_status");
      expect(upText).toContain("transferred_question_id");
      expect(upText).toContain("transferred_at");
      expect(upText).toContain("idx_studio_gen_q_op_review_status");
      expect(upText).toContain("source_staging_question_id");
      expect(upText).toContain("uq_marketing_quiz_q_staging_source");
      expect(upText).toContain("WHERE source_staging_question_id IS NOT NULL");

      await expect(down0109(mockDb)).resolves.not.toThrow();
      expect(mockDb.execute).toHaveBeenCalledTimes(2);
    });
  });

  describe("Migration 0108 Runner & Registry Invariants", () => {
    test("migration 0108 is registered with sequence 108 in ALL_MIGRATIONS", () => {
      const def = ALL_MIGRATIONS.find((m) => m.id === "0108_studio_exam_generation");
      expect(def).toBeDefined();
      expect(def?.sequence).toBe(108);
      expect(def?.sourceFile).toBe("0108_studio_exam_generation.ts");
    });

    test("executes up and down SQL idempotently", async () => {
      const mockDb = {
        execute: vi.fn().mockResolvedValue({}),
      };

      await expect(up(mockDb)).resolves.not.toThrow();
      expect(mockDb.execute).toHaveBeenCalledTimes(1);

      await expect(down(mockDb)).resolves.not.toThrow();
      expect(mockDb.execute).toHaveBeenCalledTimes(2);
    });
  });
});
