/**
 * Adaptive Generation Budgeting Policy (PR Phase 2).
 *
 * Dynamically computes an explicit, domain-grounded generation budget for a document
 * based on its actual structural dimensions (page count, chunk count, estimated tokens,
 * character density, topic complexity).
 *
 * Core principles:
 * 1. Small documents are never over-generated (prevents cognitive overload and hallucinated filler).
 * 2. Large documents are never under-generated (ensures full coverage of multi-part curricula).
 * 3. Proportional, monotonic, explainable scaling with sublinear saturation.
 * 4. Hard safety bounds against runaway LLM generation.
 * 5. 100% source chunk routability and topic grounding.
 */

export type DocumentSizeCategory =
  | "very_small"
  | "small"
  | "medium"
  | "large"
  | "very_large";

export type TopicComplexity =
  | "introductory"
  | "standard"
  | "dense"
  | "advanced";

export type GenerationBudgetInput = {
  pageCount?: number | null;
  chunkCount: number;
  totalTokens: number;
  totalCharacters?: number;
  topicComplexity?: TopicComplexity;
  customOverrides?: {
    targetTopicCount?: number;
    minTopics?: number;
    maxTopics?: number;
    targetCardsPerTopic?: number;
    targetQuestionsPerTopic?: number;
  };
};

export type TopicBudget = {
  targetTopicCount: number;
  minTopics: number;
  maxTopics: number;
  targetTokensPerTopic: number;
  rationale: string;
};

export type FlashcardBudget = {
  targetCardsPerTopic: number;
  minCardsPerTopic: number;
  maxCardsPerTopic: number;
  totalTargetCards: number;
  maxTotalCards: number;
  rationale: string;
};

export type QuizBudget = {
  targetQuestionsPerTopic: number;
  minQuestionsPerTopic: number;
  maxQuestionsPerTopic: number;
  totalTargetQuestions: number;
  maxTotalQuestions: number;
  rationale: string;
};

export type ChunkContextBudget = {
  maxSourceTokensPerTopicPrompt: number;
  maxChunksPerTopicPrompt: number;
  routingStrategy: "all_chunks" | "focused_chunks" | "batched_chunks";
};

export type GenerationStrategy = {
  mode:
    | "single_topic"
    | "standard_multi_session"
    | "deep_syllabus"
    | "extended_curriculum";
  concurrencyLimit: number;
  pacingDelayMs: number;
};

export type GenerationBudget = {
  documentMetrics: {
    pageCount: number;
    chunkCount: number;
    estimatedInputTokens: number;
    totalCharacters: number;
    sizeCategory: DocumentSizeCategory;
    complexity: TopicComplexity;
  };
  topicBudget: TopicBudget;
  flashcardBudget: FlashcardBudget;
  quizBudget: QuizBudget;
  chunkContextBudget: ChunkContextBudget;
  generationStrategy: GenerationStrategy;
  estimatedTotalSteps: number;
  calculatedAt: string;
};

/**
 * Absolute upper limits to prevent runaway LLM generation or excessive latency.
 */
export const BUDGET_LIMITS = {
  MIN_TOPICS: 1,
  MAX_TOPICS_CAP: 18,
  MIN_CARDS_PER_TOPIC: 2,
  MAX_CARDS_PER_TOPIC_CAP: 35,
  MAX_TOTAL_CARDS_CAP: 350,
  MIN_QUESTIONS_PER_TOPIC: 1,
  MAX_QUESTIONS_PER_TOPIC_CAP: 25,
  MAX_TOTAL_QUESTIONS_CAP: 250,
} as const;

/**
 * Classify document size category based on effective token load.
 */
export function classifyDocumentSize(effectiveTokens: number): DocumentSizeCategory {
  if (effectiveTokens < 1200) return "very_small";
  if (effectiveTokens < 6000) return "small";
  if (effectiveTokens < 20000) return "medium";
  if (effectiveTokens < 55000) return "large";
  return "very_large";
}

/**
 * Calculate the adaptive generation budget before starting the generation pipeline.
 *
 * Implements COVERAGE-DRIVEN GENERATION architecture:
 * - Medium/large educational documents receive at least 8 sessions.
 * - Substantive sessions receive at least 10 atomic flashcards and at least 10 quiz questions.
 * - Flashcard and quiz counts adapt to topic density and coverage requirements.
 */
export function calculateGenerationBudget(
  input: GenerationBudgetInput,
): GenerationBudget {
  const safePageCount = Math.max(1, input.pageCount ?? Math.max(1, input.chunkCount));
  const safeChunkCount = Math.max(1, input.chunkCount);
  const safeTotalTokens = Math.max(1, input.totalTokens);
  const safeTotalChars = input.totalCharacters ?? safeTotalTokens * 4;
  const complexity = input.topicComplexity ?? "standard";

  // Effective tokens factoring in chunk and page density
  const effectiveTokens = Math.max(
    safeTotalTokens,
    safeChunkCount * 250,
    safePageCount * 300,
  );

  const sizeCategory = classifyDocumentSize(effectiveTokens);

  // 1. Topic Count Budget Calculation
  // Explicit minimum session policy: Medium/large documents must produce at least 8 sessions.
  let baseTargetTopics: number;
  let minTopics: number;
  let maxTopics: number;
  let strategyMode: GenerationStrategy["mode"];
  let pacingDelayMs = 500;

  switch (sizeCategory) {
    case "very_small":
      baseTargetTopics = 1;
      minTopics = 1;
      maxTopics = safeChunkCount > 1 ? 2 : 1;
      strategyMode = "single_topic";
      pacingDelayMs = 300;
      break;

    case "small":
      // ~2 to 4 topics for short lecture notes (e.g. 2-6 pages)
      baseTargetTopics = Math.min(
        4,
        Math.max(2, Math.round(1 + Math.sqrt((effectiveTokens - 800) / 900))),
      );
      minTopics = 2;
      maxTopics = Math.min(4, baseTargetTopics + 1);
      strategyMode = "standard_multi_session";
      pacingDelayMs = 400;
      break;

    case "medium":
      // Medium documents (e.g. 10-25 pages / Katzung Chapter 39) -> AT LEAST 8 sessions
      baseTargetTopics = Math.min(
        12,
        Math.max(8, Math.round(6 + Math.sqrt((effectiveTokens - 5000) / 1200))),
      );
      minTopics = 8;
      maxTopics = Math.min(12, baseTargetTopics + 2);
      strategyMode = "deep_syllabus";
      pacingDelayMs = 500;
      break;

    case "large":
      // Large documents (25-60 pages) -> 10-14 sessions
      baseTargetTopics = Math.min(
        14,
        Math.max(10, Math.round(8 + Math.sqrt((effectiveTokens - 15000) / 2000))),
      );
      minTopics = 8;
      maxTopics = Math.min(16, baseTargetTopics + 2);
      strategyMode = "extended_curriculum";
      pacingDelayMs = 600;
      break;

    case "very_large":
    default:
      // Very large documents (60+ pages) -> 12-16 sessions
      baseTargetTopics = Math.min(
        16,
        Math.max(12, Math.round(10 + Math.sqrt((effectiveTokens - 40000) / 3000))),
      );
      minTopics = 10;
      maxTopics = Math.min(BUDGET_LIMITS.MAX_TOPICS_CAP, baseTargetTopics + 2);
      strategyMode = "extended_curriculum";
      pacingDelayMs = 700;
      break;
  }

  // Adjust slightly for complexity
  if (complexity === "dense" || complexity === "advanced") {
    if (sizeCategory !== "very_small") {
      baseTargetTopics = Math.min(maxTopics, baseTargetTopics + 1);
    }
  }

  // Apply custom overrides if provided
  const targetTopicCount = Math.max(
    BUDGET_LIMITS.MIN_TOPICS,
    Math.min(
      BUDGET_LIMITS.MAX_TOPICS_CAP,
      input.customOverrides?.targetTopicCount ?? baseTargetTopics,
    ),
  );

  const finalMinTopics = Math.max(
    BUDGET_LIMITS.MIN_TOPICS,
    Math.min(
      targetTopicCount,
      input.customOverrides?.minTopics ?? minTopics,
    ),
  );

  const finalMaxTopics = Math.min(
    BUDGET_LIMITS.MAX_TOPICS_CAP,
    Math.max(
      targetTopicCount,
      input.customOverrides?.maxTopics ?? maxTopics,
    ),
  );

  const targetTokensPerTopic = Math.max(
    300,
    Math.round(safeTotalTokens / targetTopicCount),
  );

  const topicBudget: TopicBudget = {
    targetTopicCount,
    minTopics: finalMinTopics,
    maxTopics: finalMaxTopics,
    targetTokensPerTopic,
    rationale: `Document classified as ${sizeCategory} (${safePageCount} pages, ${safeChunkCount} chunks, ~${safeTotalTokens} tokens). Targeted ${targetTopicCount} sessions (${finalMinTopics}-${finalMaxTopics}) averaging ~${targetTokensPerTopic} tokens/topic.`,
  };

  // 2. Flashcard Budget Calculation (Coverage-driven: min 10 per substantive session)
  let baseCardsPerTopic: number;
  let minCardsPerTopic: number;
  let maxCardsPerTopic: number;

  switch (sizeCategory) {
    case "very_small":
      baseCardsPerTopic = 4;
      minCardsPerTopic = 2;
      maxCardsPerTopic = 6;
      break;
    case "small":
      baseCardsPerTopic = 10;
      minCardsPerTopic = 8;
      maxCardsPerTopic = 15;
      break;
    case "medium":
      baseCardsPerTopic = 14;
      minCardsPerTopic = 10;
      maxCardsPerTopic = 25;
      break;
    case "large":
      baseCardsPerTopic = 16;
      minCardsPerTopic = 10;
      maxCardsPerTopic = 25;
      break;
    case "very_large":
    default:
      baseCardsPerTopic = 16;
      minCardsPerTopic = 10;
      maxCardsPerTopic = 25;
      break;
  }

  const targetCardsPerTopic = Math.max(
    BUDGET_LIMITS.MIN_CARDS_PER_TOPIC,
    Math.min(
      BUDGET_LIMITS.MAX_CARDS_PER_TOPIC_CAP,
      input.customOverrides?.targetCardsPerTopic ?? baseCardsPerTopic,
    ),
  );

  const totalTargetCards = targetTopicCount * targetCardsPerTopic;
  const maxTotalCards = Math.min(
    BUDGET_LIMITS.MAX_TOTAL_CARDS_CAP,
    finalMaxTopics * maxCardsPerTopic,
  );

  const flashcardBudget: FlashcardBudget = {
    targetCardsPerTopic,
    minCardsPerTopic,
    maxCardsPerTopic,
    totalTargetCards,
    maxTotalCards,
    rationale: `Targeting ${targetCardsPerTopic} atomic flashcards per topic (${minCardsPerTopic}-${maxCardsPerTopic}) totaling ~${totalTargetCards} cards (capped at ${maxTotalCards}).`,
  };

  // 3. Quiz Budget Calculation (Hard requirement: min 10 questions per substantive session)
  let baseQuestionsPerTopic: number;
  let minQuestionsPerTopic: number;
  let maxQuestionsPerTopic: number;

  switch (sizeCategory) {
    case "very_small":
      baseQuestionsPerTopic = 3;
      minQuestionsPerTopic = 2;
      maxQuestionsPerTopic = 5;
      break;
    case "small":
      baseQuestionsPerTopic = 10;
      minQuestionsPerTopic = 8;
      maxQuestionsPerTopic = 12;
      break;
    case "medium":
      baseQuestionsPerTopic = 12;
      minQuestionsPerTopic = 10;
      maxQuestionsPerTopic = 18;
      break;
    case "large":
      baseQuestionsPerTopic = 12;
      minQuestionsPerTopic = 10;
      maxQuestionsPerTopic = 20;
      break;
    case "very_large":
    default:
      baseQuestionsPerTopic = 12;
      minQuestionsPerTopic = 10;
      maxQuestionsPerTopic = 20;
      break;
  }

  const targetQuestionsPerTopic = Math.max(
    BUDGET_LIMITS.MIN_QUESTIONS_PER_TOPIC,
    Math.min(
      BUDGET_LIMITS.MAX_QUESTIONS_PER_TOPIC_CAP,
      input.customOverrides?.targetQuestionsPerTopic ?? baseQuestionsPerTopic,
    ),
  );

  const totalTargetQuestions = targetTopicCount * targetQuestionsPerTopic;
  const maxTotalQuestions = Math.min(
    BUDGET_LIMITS.MAX_TOTAL_QUESTIONS_CAP,
    finalMaxTopics * maxQuestionsPerTopic,
  );

  const quizBudget: QuizBudget = {
    targetQuestionsPerTopic,
    minQuestionsPerTopic,
    maxQuestionsPerTopic,
    totalTargetQuestions,
    maxTotalQuestions,
    rationale: `Targeting ${targetQuestionsPerTopic} practice questions per topic (${minQuestionsPerTopic}-${maxQuestionsPerTopic}) totaling ~${totalTargetQuestions} questions (capped at ${maxTotalQuestions}).`,
  };

  // 4. Context Routing Budget
  const routingStrategy = safeChunkCount <= 8 ? "all_chunks" : "focused_chunks";
  const maxSourceTokensPerTopicPrompt =
    routingStrategy === "all_chunks"
      ? Math.min(25000, safeTotalTokens)
      : Math.min(15000, Math.max(3000, Math.ceil(safeTotalTokens / targetTopicCount) * 2));

  const maxChunksPerTopicPrompt =
    routingStrategy === "all_chunks"
      ? safeChunkCount
      : Math.max(3, Math.ceil(safeChunkCount / targetTopicCount) + 2);

  const chunkContextBudget: ChunkContextBudget = {
    maxSourceTokensPerTopicPrompt,
    maxChunksPerTopicPrompt,
    routingStrategy,
  };

  // 5. Strategy & Estimated Steps
  // Outline (1) + Sessions (N) + Flashcards (N) + Quizzes (N) + Recommendation (1)
  const estimatedTotalSteps = 1 + targetTopicCount * 3 + 1;

  return {
    documentMetrics: {
      pageCount: safePageCount,
      chunkCount: safeChunkCount,
      estimatedInputTokens: safeTotalTokens,
      totalCharacters: safeTotalChars,
      sizeCategory,
      complexity,
    },
    topicBudget,
    flashcardBudget,
    quizBudget,
    chunkContextBudget,
    generationStrategy: {
      mode: strategyMode,
      concurrencyLimit: 1,
      pacingDelayMs,
    },
    estimatedTotalSteps,
    calculatedAt: new Date().toISOString(),
  };
}
