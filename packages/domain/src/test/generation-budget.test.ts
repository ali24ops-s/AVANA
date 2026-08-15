import { describe, expect, it } from "vitest";
import {
  calculateGenerationBudget,
  classifyDocumentSize,
  BUDGET_LIMITS,
} from "../generation-budget.js";

describe("Adaptive Generation Budgeting (Phase 2)", () => {
  describe("classifyDocumentSize", () => {
    it("correctly classifies sizes based on token boundaries", () => {
      expect(classifyDocumentSize(500)).toBe("very_small");
      expect(classifyDocumentSize(1199)).toBe("very_small");
      expect(classifyDocumentSize(1200)).toBe("small");
      expect(classifyDocumentSize(4000)).toBe("small");
      expect(classifyDocumentSize(6000)).toBe("medium");
      expect(classifyDocumentSize(15000)).toBe("medium");
      expect(classifyDocumentSize(20000)).toBe("large");
      expect(classifyDocumentSize(50000)).toBe("large");
      expect(classifyDocumentSize(55000)).toBe("very_large");
      expect(classifyDocumentSize(120000)).toBe("very_large");
    });
  });

  describe("Representative Cases", () => {
    it("Case A: Very Small Document (1 page, 1 chunk, 400 tokens)", () => {
      const budget = calculateGenerationBudget({
        pageCount: 1,
        chunkCount: 1,
        totalTokens: 400,
        totalCharacters: 1600,
      });

      expect(budget.documentMetrics.sizeCategory).toBe("very_small");
      expect(budget.topicBudget.targetTopicCount).toBe(1);
      expect(budget.topicBudget.minTopics).toBe(1);
      expect(budget.topicBudget.maxTopics).toBe(1);

      // Flashcards: Small, focused count (no runaway hallucinated cards)
      expect(budget.flashcardBudget.targetCardsPerTopic).toBe(4);
      expect(budget.flashcardBudget.minCardsPerTopic).toBe(2);
      expect(budget.flashcardBudget.maxCardsPerTopic).toBe(6);
      expect(budget.flashcardBudget.totalTargetCards).toBe(4);

      // Quizzes: 2-5 questions
      expect(budget.quizBudget.targetQuestionsPerTopic).toBe(3);
      expect(budget.quizBudget.minQuestionsPerTopic).toBe(2);
      expect(budget.quizBudget.maxQuestionsPerTopic).toBe(5);
      expect(budget.quizBudget.totalTargetQuestions).toBe(3);

      // Strategy & routing
      expect(budget.chunkContextBudget.routingStrategy).toBe("all_chunks");
      expect(budget.generationStrategy.mode).toBe("single_topic");
      expect(budget.topicBudget.rationale).toContain("very_small");
    });

    it("Case B: Current 6-Page Document (6 pages, 6 chunks, 3,000 tokens)", () => {
      const budget = calculateGenerationBudget({
        pageCount: 6,
        chunkCount: 6,
        totalTokens: 3000,
        totalCharacters: 12000,
      });

      expect(budget.documentMetrics.sizeCategory).toBe("small");
      expect(budget.topicBudget.targetTopicCount).toBeGreaterThanOrEqual(2);
      expect(budget.topicBudget.targetTopicCount).toBeLessThanOrEqual(4);
      expect(budget.topicBudget.minTopics).toBe(2);
      expect(budget.topicBudget.maxTopics).toBeLessThanOrEqual(5);

      // Flashcards: min 8-10 for small documents
      expect(budget.flashcardBudget.targetCardsPerTopic).toBe(10);
      expect(budget.flashcardBudget.minCardsPerTopic).toBe(8);
      expect(budget.flashcardBudget.maxCardsPerTopic).toBe(15);
      expect(budget.flashcardBudget.totalTargetCards).toBeGreaterThanOrEqual(20);

      // Quizzes: min 8-10 for small documents
      expect(budget.quizBudget.targetQuestionsPerTopic).toBe(10);
      expect(budget.quizBudget.minQuestionsPerTopic).toBe(8);
      expect(budget.quizBudget.maxQuestionsPerTopic).toBe(12);
      expect(budget.quizBudget.totalTargetQuestions).toBeGreaterThanOrEqual(20);

      // Routing
      expect(budget.chunkContextBudget.routingStrategy).toBe("all_chunks");
      expect(budget.generationStrategy.mode).toBe("standard_multi_session");
    });

    it("Case C: Medium Document (20 pages, 20 chunks, 12,000 tokens) produces AT LEAST 8 sessions", () => {
      const budget = calculateGenerationBudget({
        pageCount: 20,
        chunkCount: 20,
        totalTokens: 12000,
        totalCharacters: 48000,
      });

      expect(budget.documentMetrics.sizeCategory).toBe("medium");
      // Minimum session policy: at least 8 sessions for medium/large documents
      expect(budget.topicBudget.targetTopicCount).toBeGreaterThanOrEqual(8);
      expect(budget.topicBudget.targetTopicCount).toBeLessThanOrEqual(12);
      expect(budget.topicBudget.minTopics).toBe(8);
      expect(budget.topicBudget.maxTopics).toBeLessThanOrEqual(12);

      // Flashcards: 10-25 cards per topic
      expect(budget.flashcardBudget.targetCardsPerTopic).toBe(14);
      expect(budget.flashcardBudget.minCardsPerTopic).toBe(10);
      expect(budget.flashcardBudget.maxCardsPerTopic).toBe(25);
      expect(budget.flashcardBudget.totalTargetCards).toBeGreaterThanOrEqual(80);

      // Quizzes: at least 10 questions per topic
      expect(budget.quizBudget.targetQuestionsPerTopic).toBe(12);
      expect(budget.quizBudget.minQuestionsPerTopic).toBe(10);
      expect(budget.quizBudget.totalTargetQuestions).toBeGreaterThanOrEqual(80);

      // Routing: > 8 chunks switches to focused_chunks routing
      expect(budget.chunkContextBudget.routingStrategy).toBe("focused_chunks");
      expect(budget.generationStrategy.mode).toBe("deep_syllabus");
    });

    it("Case D: Large Document (50 pages, 50 chunks, 35,000 tokens)", () => {
      const budget = calculateGenerationBudget({
        pageCount: 50,
        chunkCount: 50,
        totalTokens: 35000,
        totalCharacters: 140000,
      });

      expect(budget.documentMetrics.sizeCategory).toBe("large");
      expect(budget.topicBudget.targetTopicCount).toBeGreaterThanOrEqual(10);
      expect(budget.topicBudget.targetTopicCount).toBeLessThanOrEqual(14);
      expect(budget.topicBudget.minTopics).toBe(8);

      // Flashcards
      expect(budget.flashcardBudget.targetCardsPerTopic).toBe(16);
      expect(budget.flashcardBudget.totalTargetCards).toBeGreaterThanOrEqual(100);

      // Quizzes: at least 10 questions per topic
      expect(budget.quizBudget.targetQuestionsPerTopic).toBe(12);
      expect(budget.quizBudget.totalTargetQuestions).toBeGreaterThanOrEqual(100);

      expect(budget.chunkContextBudget.routingStrategy).toBe("focused_chunks");
      expect(budget.generationStrategy.mode).toBe("extended_curriculum");
    });

    it("Case E: Very Large Document (120 pages, 120 chunks, 90,000 tokens)", () => {
      const budget = calculateGenerationBudget({
        pageCount: 120,
        chunkCount: 120,
        totalTokens: 90000,
        totalCharacters: 360000,
      });

      expect(budget.documentMetrics.sizeCategory).toBe("very_large");
      expect(budget.topicBudget.targetTopicCount).toBeGreaterThanOrEqual(12);
      expect(budget.topicBudget.targetTopicCount).toBeLessThanOrEqual(16); // capped at sensible max

      // Flashcards & Quizzes bounded
      expect(budget.flashcardBudget.totalTargetCards).toBeGreaterThanOrEqual(120);
      expect(budget.flashcardBudget.totalTargetCards).toBeLessThanOrEqual(BUDGET_LIMITS.MAX_TOTAL_CARDS_CAP);
      expect(budget.quizBudget.totalTargetQuestions).toBeGreaterThanOrEqual(120);
      expect(budget.quizBudget.totalTargetQuestions).toBeLessThanOrEqual(BUDGET_LIMITS.MAX_TOTAL_QUESTIONS_CAP);

      expect(budget.chunkContextBudget.routingStrategy).toBe("focused_chunks");
      expect(budget.generationStrategy.mode).toBe("extended_curriculum");
    });
  });

  describe("Scaling, Monotonicity & Protections", () => {
    it("scales topic count and total artifacts monotonically across sizes", () => {
      const sizes = [
        { pages: 1, chunks: 1, tokens: 400 },
        { pages: 6, chunks: 6, tokens: 3000 },
        { pages: 20, chunks: 20, tokens: 12000 },
        { pages: 50, chunks: 50, tokens: 35000 },
        { pages: 120, chunks: 120, tokens: 90000 },
      ];

      const budgets = sizes.map((s) =>
        calculateGenerationBudget({
          pageCount: s.pages,
          chunkCount: s.chunks,
          totalTokens: s.tokens,
        }),
      );

      for (let i = 1; i < budgets.length; i++) {
        const prev = budgets[i - 1];
        const curr = budgets[i];

        expect(curr.topicBudget.targetTopicCount).toBeGreaterThanOrEqual(
          prev.topicBudget.targetTopicCount,
        );
        expect(curr.flashcardBudget.totalTargetCards).toBeGreaterThanOrEqual(
          prev.flashcardBudget.totalTargetCards,
        );
        expect(curr.quizBudget.totalTargetQuestions).toBeGreaterThanOrEqual(
          prev.quizBudget.totalTargetQuestions,
        );
      }
    });

    it("respects minimums even for empty or near-zero inputs", () => {
      const budget = calculateGenerationBudget({
        pageCount: 0,
        chunkCount: 0,
        totalTokens: 0,
      });

      expect(budget.topicBudget.targetTopicCount).toBeGreaterThanOrEqual(BUDGET_LIMITS.MIN_TOPICS);
      expect(budget.topicBudget.minTopics).toBeGreaterThanOrEqual(BUDGET_LIMITS.MIN_TOPICS);
      expect(budget.flashcardBudget.targetCardsPerTopic).toBeGreaterThanOrEqual(BUDGET_LIMITS.MIN_CARDS_PER_TOPIC);
      expect(budget.quizBudget.targetQuestionsPerTopic).toBeGreaterThanOrEqual(BUDGET_LIMITS.MIN_QUESTIONS_PER_TOPIC);
    });

    it("prevents runaway generation on massive documents (1,000,000 tokens)", () => {
      const budget = calculateGenerationBudget({
        pageCount: 2000,
        chunkCount: 2000,
        totalTokens: 1000000,
      });

      expect(budget.topicBudget.targetTopicCount).toBeLessThanOrEqual(BUDGET_LIMITS.MAX_TOPICS_CAP);
      expect(budget.topicBudget.maxTopics).toBeLessThanOrEqual(BUDGET_LIMITS.MAX_TOPICS_CAP);
      expect(budget.flashcardBudget.maxTotalCards).toBeLessThanOrEqual(BUDGET_LIMITS.MAX_TOTAL_CARDS_CAP);
      expect(budget.quizBudget.maxTotalQuestions).toBeLessThanOrEqual(BUDGET_LIMITS.MAX_TOTAL_QUESTIONS_CAP);
    });

    it("adjusts topic count for dense or advanced complexity", () => {
      const standardBudget = calculateGenerationBudget({
        pageCount: 20,
        chunkCount: 20,
        totalTokens: 12000,
        topicComplexity: "standard",
      });

      const denseBudget = calculateGenerationBudget({
        pageCount: 20,
        chunkCount: 20,
        totalTokens: 12000,
        topicComplexity: "dense",
      });

      expect(denseBudget.topicBudget.targetTopicCount).toBeGreaterThanOrEqual(
        standardBudget.topicBudget.targetTopicCount,
      );
    });

    it("honors safe custom overrides within bounds", () => {
      const budget = calculateGenerationBudget({
        pageCount: 6,
        chunkCount: 6,
        totalTokens: 3000,
        customOverrides: {
          targetTopicCount: 4,
          targetCardsPerTopic: 6,
          targetQuestionsPerTopic: 4,
        },
      });

      expect(budget.topicBudget.targetTopicCount).toBe(4);
      expect(budget.flashcardBudget.targetCardsPerTopic).toBe(6);
      expect(budget.quizBudget.targetQuestionsPerTopic).toBe(4);
    });
  });
});
