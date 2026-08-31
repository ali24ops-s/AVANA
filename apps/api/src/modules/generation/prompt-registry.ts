/**
 * AVANA Prompt Registry & Single Source of Truth (PR6-Prompt-Inspector).
 *
 * This module is the sole source of truth for all production AI prompts
 * across the AVANA platform:
 * - Content Planning & Topic Decomposition
 * - Batched Educational Lessons
 * - Batched Atomic Flashcards
 * - Batched Multiple-Choice Quizzes
 * - Study Recommendations Synthesis
 * - Lesson AI Study Assistant («از آوانا بپرس»)
 * - Dashboard General AI Assistant & Mentor
 *
 * Architecture Rule:
 * GenerationService and StudyAssistantService consume prompt constants and
 * builders directly from this module. The Prompt Inspector API exposes them
 * read-only to administrators without duplication or drift.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PromptCategory =
  | "Content Planning"
  | "Lesson Generation"
  | "Flashcard Generation"
  | "Quiz Generation"
  | "Summary Generation"
  | "Review Summary"
  | "Study Assistant";

export interface PromptDefinition {
  id: string;
  name: string;
  description: string;
  category: PromptCategory;
  provider: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  variables: string[];
  sourceFile: string;
  sourceLocation: string;
  status: "active" | "inactive";
}

// ---------------------------------------------------------------------------
// 0. Shared Language Requirement
// ---------------------------------------------------------------------------

export const LANGUAGE_REQUIREMENT_PROMPT = [
  `MANDATORY LANGUAGE & TRANSLATION REQUIREMENT:`,
  `- Regardless of the language of the source chunks (whether English, Persian, or bilingual/mixed), you MUST generate all outputs (module title, outline topics, educational lessons, markdown texts, flashcards, questions, choices, and explanations) entirely in natural, fluent, high-standard academic Persian (زبان فارسی روان و استاندارد علمی).`,
  `- If the source document is in English, translate, interpret, and explain all concepts thoroughly in Persian.`,
  `- For key medical/scientific technical terms, provide the standard Persian translation and you may include the English term in parentheses next to it (e.g. 'پرفشاری خون اولیه (Primary / Essential Hypertension)').`,
].join("\n");

// ---------------------------------------------------------------------------
// 1. Content Planning & Topic Decomposition
// ---------------------------------------------------------------------------

export const CONTENT_PLANNING_SYSTEM_PROMPT =
  "You produce structured JSON educational content plans.";

export interface ContentPlanningPromptParams {
  docName: string;
  targetTopicCount: number;
  minTopics: number;
  maxTopics: number;
  minCardsPerTopic: number;
  minQuestionsPerTopic: number;
  chunkCount: number;
  chunkContext: string;
  chunkIdList: string[];
}

export function buildContentPlanningUserPrompt(
  params: ContentPlanningPromptParams,
): string {
  const exampleChunkId = params.chunkIdList[0] || "chunk-id-1";
  return [
    `You are AVANA's Expert Educational AI Content Engine.`,
    `TASK: COVERAGE-FIRST CONTENT PLANNING & TOPIC DECOMPOSITION for "${params.docName}".`,
    ``,
    LANGUAGE_REQUIREMENT_PROMPT,
    ``,
    `COVERAGE POLICY (docs/AI_LEARNING_POLICY.md & Coverage Architecture):`,
    `- Comprehensively analyze the source chunks to identify all educational material:`,
    `  * Core Concepts & Classifications`,
    `  * Mechanisms of action & Molecular receptors/targets`,
    `  * Pharmacodynamic & Physiological effects`,
    `  * Therapeutic indications & Clinical uses`,
    `  * Adverse effects, Toxicities & High-risk warnings`,
    `  * Contraindications & Drug-Drug/Food Interactions`,
    `  * Pharmacokinetic parameters (absorption, metabolism, half-life)`,
    `  * Antidotes & Toxicity management`,
    `  * Drug-specific differences & Comparison matrices`,
    `  * Clinical pearls & High-yield exam facts`,
    `- SYLLABUS FORMATION: Decompose the content logically into distinct learning sessions.`,
    `- Target session count: ${params.targetTopicCount} sessions (minimum required: at least ${params.minTopics} sessions, allowed range ${params.minTopics} to ${params.maxTopics} sessions).`,
    `- Each session represents a deep, substantive learning module. Do not over-compress rich medical/pharmacological chapters into too few sessions.`,
    `- Map all ${params.chunkCount} available chunk IDs across sessions via "relevantChunkIds".`,
    `- Set targetFlashcardCount per session to at least ${params.minCardsPerTopic} (dense sessions: 12-25+ cards).`,
    `- Set targetQuizCount per session to at least ${params.minQuestionsPerTopic} questions.`,
    ``,
    `SOURCE CHUNKS:`,
    params.chunkContext,
    ``,
    `AVAILABLE CHUNK IDs:`,
    JSON.stringify(params.chunkIdList),
    ``,
    `OUTPUT INSTRUCTIONS:`,
    `Return ONLY valid JSON matching this schema:`,
    JSON.stringify({
      kind: "content_plan",
      moduleTitle: "عنوان جامع ماژول آموزشی به فارسی",
      sourceTopics: [
        {
          id: "topic-1",
          title: "عنوان بخش موضوعی منبع",
          description: "شرح خلاصه مبحث",
          category: "pharmacology",
          relevantChunkIds: [exampleChunkId],
        },
      ],
      sessions: [
        {
          index: 0,
          title: "جلسه ۱: عنوان تفصیلی جلسه آموزشی",
          description: "اهداف آموزشی و پوشش سرفصل",
          coreConcepts: [
            {
              id: "c-1",
              name: "نام مفهوم یا دارو",
              category: "mechanism",
              description: "شرح مکانیسم یا نکته بالینی",
              sourceChunkIds: [exampleChunkId],
            },
          ],
          relevantChunkIds: [exampleChunkId],
          targetFlashcardCount: 12,
          targetQuizCount: 10,
        },
      ],
      highYieldFacts: [
        {
          id: "fact-1",
          fact: "نکته فوق‌العاده مهم آزمونی یا بالینی",
          category: "high_yield",
          sessionIndex: 0,
        },
      ],
      citationChunkIds: params.chunkIdList,
    }),
  ].join("\n");
}

export function getContentPlanningTemplate(): string {
  return [
    `You are AVANA's Expert Educational AI Content Engine.`,
    `TASK: COVERAGE-FIRST CONTENT PLANNING & TOPIC DECOMPOSITION for "{{documentTitle}}".`,
    ``,
    LANGUAGE_REQUIREMENT_PROMPT,
    ``,
    `COVERAGE POLICY (docs/AI_LEARNING_POLICY.md & Coverage Architecture):`,
    `- Comprehensively analyze the source chunks to identify all educational material:`,
    `  * Core Concepts & Classifications`,
    `  * Mechanisms of action & Molecular receptors/targets`,
    `  * Pharmacodynamic & Physiological effects`,
    `  * Therapeutic indications & Clinical uses`,
    `  * Adverse effects, Toxicities & High-risk warnings`,
    `  * Contraindications & Drug-Drug/Food Interactions`,
    `  * Pharmacokinetic parameters (absorption, metabolism, half-life)`,
    `  * Antidotes & Toxicity management`,
    `  * Drug-specific differences & Comparison matrices`,
    `  * Clinical pearls & High-yield exam facts`,
    `- SYLLABUS FORMATION: Decompose the content logically into distinct learning sessions.`,
    `- Target session count: {{targetTopicCount}} sessions (minimum required: at least {{minTopics}} sessions, allowed range {{minTopics}} to {{maxTopics}} sessions).`,
    `- Each session represents a deep, substantive learning module. Do not over-compress rich medical/pharmacological chapters into too few sessions.`,
    `- Map all {{chunkCount}} available chunk IDs across sessions via "relevantChunkIds".`,
    `- Set targetFlashcardCount per session to at least {{minCardsPerTopic}} (dense sessions: 12-25+ cards).`,
    `- Set targetQuizCount per session to at least {{minQuestionsPerTopic}} questions.`,
    ``,
    `SOURCE CHUNKS:`,
    `{{chunkContext}}`,
    ``,
    `AVAILABLE CHUNK IDs:`,
    `{{availableChunkIds}}`,
    ``,
    `OUTPUT INSTRUCTIONS:`,
    `Return ONLY valid JSON matching this schema:`,
    JSON.stringify(
      {
        kind: "content_plan",
        moduleTitle: "عنوان جامع ماژول آموزشی به فارسی",
        sourceTopics: [
          {
            id: "topic-1",
            title: "عنوان بخش موضوعی منبع",
            description: "شرح خلاصه مبحث",
            category: "pharmacology",
            relevantChunkIds: ["{{chunkId}}"],
          },
        ],
        sessions: [
          {
            index: 0,
            title: "جلسه ۱: عنوان تفصیلی جلسه آموزشی",
            description: "اهداف آموزشی و پوشش سرفصل",
            coreConcepts: [
              {
                id: "c-1",
                name: "نام مفهوم یا دارو",
                category: "mechanism",
                description: "شرح مکانیسم یا نکته بالینی",
                sourceChunkIds: ["{{chunkId}}"],
              },
            ],
            relevantChunkIds: ["{{chunkId}}"],
            targetFlashcardCount: 12,
            targetQuizCount: 10,
          },
        ],
        highYieldFacts: [
          {
            id: "fact-1",
            fact: "نکته فوق‌العاده مهم آزمونی یا بالینی",
            category: "high_yield",
            sessionIndex: 0,
          },
        ],
        citationChunkIds: ["{{chunkId}}"],
      },
      null,
      2,
    ),
  ].join("\n");
}

// ---------------------------------------------------------------------------
// 2. Batched Lesson Generation
// ---------------------------------------------------------------------------

export const LESSON_GENERATION_SYSTEM_PROMPT =
  "You produce structured JSON educational lesson content.";

export interface LessonGenerationPromptParams {
  batchStart: number;
  batchEnd: number;
  totalSessions: number;
  docName: string;
  batchBlueprintsJson: string;
  chunkContext: string;
  chunkIdList: string[];
  schemaBatchExample: Array<{
    index: number;
    title: string;
    relevantChunkIds: string[];
  }>;
}

export function buildLessonGenerationUserPrompt(
  params: LessonGenerationPromptParams,
): string {
  return [
    `You are AVANA's Expert Educational AI Content Engine.`,
    `TASK: GENERATE DEEP EDUCATIONAL LESSONS (BATCH OF SESSIONS ${params.batchStart} TO ${params.batchEnd} of ${params.totalSessions}).`,
    `DOCUMENT: "${params.docName}".`,
    ``,
    LANGUAGE_REQUIREMENT_PROMPT,
    ``,
    `SESSIONS TO GENERATE IN THIS BATCH:`,
    params.batchBlueprintsJson,
    ``,
    `LESSON GENERATION REQUIREMENTS (docs/AI_LEARNING_POLICY.md & Coverage Architecture):`,
    `- Philosophy: "TEACH THE DOCUMENT COMPREHENSIVELY" — do not merely summarize. Prioritize educational coverage over brevity.`,
    `- For EACH session in this batch, generate a complete, deeply structured educational lesson in natural academic Persian.`,
    `- Structure each session with clear Markdown headings (H1 for session title, H2/H3 for subsections, bullet points, bold key terms).`,
    `- MUST PRESERVE all pharmacological/educational dimensions when present:`,
    `  * Mechanism of Action & Molecular Target/Receptor`,
    `  * Pharmacodynamic & Physiological Effects`,
    `  * Therapeutic Indications & Clinical Uses`,
    `  * Adverse Effects, Toxicities & Contraindications`,
    `  * Pharmacokinetic Points (metabolism, half-life, active forms)`,
    `  * Drug-specific differences, Antidotes & Toxicity management`,
    `  * Clinical pearls & High-yield exam facts`,
    `- GFM COMPARISON TABLES: Include at least one GitHub-Flavored Markdown table per session comparing drugs, classifications, or parameters (e.g. | نام دارو | گیرنده | نیمه‌عمر | کاربرد بالینی | عوارض |).`,
    `- Ground all content in the provided SOURCE CHUNKS.`,
    ``,
    `SOURCE CHUNKS FOR THIS BATCH:`,
    params.chunkContext,
    ``,
    `AVAILABLE CHUNK IDs:`,
    JSON.stringify(params.chunkIdList),
    ``,
    `OUTPUT INSTRUCTIONS:`,
    `Return ONLY valid JSON matching this schema:`,
    JSON.stringify({
      kind: "sessions_batch",
      sessions: params.schemaBatchExample.map((s) => ({
        index: s.index,
        title: s.title,
        contentMarkdown: `# ${s.title}\n\n## ۱. تعاریف و اصول پایه\n...\n\n## ۲. مکانیسم‌های سلولی و فارماکودینامیک\n...\n\n## ۳. جدول مقایسه‌ای داروها و دسته‌بندی‌ها\n| نام دارو | گیرنده هدف | نیمه‌عمر | کاربرد درمانی | عوارض شایع |\n|---|---|---|---|---|\n| ... | ... | ... | ... | ... |\n\n## ۴. اندیکاسیون‌ها و نکات بالینی\n...\n\n## ۵. نکات کلیدی و جمع‌بندی آزمونی\n...`,
        citationChunkIds: s.relevantChunkIds,
      })),
    }),
  ].join("\n");
}

export function getLessonGenerationTemplate(): string {
  return [
    `You are AVANA's Expert Educational AI Content Engine.`,
    `TASK: BATCHED LESSON GENERATION (SESSIONS {{batchStart}} TO {{batchEnd}} of {{totalSessions}}).`,
    `DOCUMENT: "{{documentTitle}}".`,
    ``,
    LANGUAGE_REQUIREMENT_PROMPT,
    ``,
    `SESSION BLUEPRINTS TO TEACH IN THIS BATCH:`,
    `{{batchBlueprintsJson}}`,
    ``,
    `LESSON GENERATION REQUIREMENTS (docs/AI_LEARNING_POLICY.md & Coverage Architecture):`,
    `- Philosophy: "TEACH THE DOCUMENT COMPREHENSIVELY" — do not merely summarize. Prioritize educational coverage over brevity.`,
    `- For EACH session in this batch, generate a complete, deeply structured educational lesson in natural academic Persian.`,
    `- Structure each session with clear Markdown headings (H1 for session title, H2/H3 for subsections, bullet points, bold key terms).`,
    `- MUST PRESERVE all pharmacological/educational dimensions when present:`,
    `  * Mechanism of Action & Molecular Target/Receptor`,
    `  * Pharmacodynamic & Physiological Effects`,
    `  * Therapeutic Indications & Clinical Uses`,
    `  * Adverse Effects, Toxicities & Contraindications`,
    `  * Pharmacokinetic Points (metabolism, half-life, active forms)`,
    `  * Drug-specific differences, Antidotes & Toxicity management`,
    `  * Clinical pearls & High-yield exam facts`,
    `- GFM COMPARISON TABLES: Include at least one GitHub-Flavored Markdown table per session comparing drugs, classifications, or parameters (e.g. | نام دارو | گیرنده | نیمه‌عمر | کاربرد بالینی | عوارض |).`,
    `- Ground all content in the provided SOURCE CHUNKS.`,
    ``,
    `SOURCE CHUNKS FOR THIS BATCH:`,
    `{{chunkContext}}`,
    ``,
    `AVAILABLE CHUNK IDs:`,
    `{{availableChunkIds}}`,
    ``,
    `OUTPUT INSTRUCTIONS:`,
    `Return ONLY valid JSON matching this schema:`,
    JSON.stringify(
      {
        kind: "sessions_batch",
        sessions: [
          {
            index: 0,
            title: "{{sessionTitle}}",
            contentMarkdown:
              "# {{sessionTitle}}\\n\\n## ۱. تعاریف و اصول پایه\\n...\\n\\n## ۲. مکانیسم‌های سلولی و فارماکودینامیک\\n...\\n\\n## ۳. جدول مقایسه‌ای داروها\\n| نام دارو | گیرنده | نیمه‌عمر | کاربرد | عوارض |\\n|---|---|---|---|---|\\n\\n## ۴. نکات بالینی\\n...",
            citationChunkIds: ["{{chunkId}}"],
          },
        ],
      },
      null,
      2,
    ),
  ].join("\n");
}

// ---------------------------------------------------------------------------
// 3. Batched Atomic Flashcard Generation
// ---------------------------------------------------------------------------

export const FLASHCARD_GENERATION_SYSTEM_PROMPT =
  "You produce structured JSON atomic flashcards.";

export interface FlashcardGenerationPromptParams {
  batchStart: number;
  batchEnd: number;
  totalSessions: number;
  docName: string;
  minCardsPerTopic: number;
  batchSummaries: string;
  chunkIdList: string[];
  firstSessionIndex: number;
}

export function buildFlashcardGenerationUserPrompt(
  params: FlashcardGenerationPromptParams,
): string {
  return [
    `You are AVANA's Expert Educational AI Content Engine.`,
    `TASK: BATCHED ATOMIC FLASHCARDS (SESSIONS ${params.batchStart} TO ${params.batchEnd} of ${params.totalSessions}).`,
    `DOCUMENT: "${params.docName}".`,
    ``,
    LANGUAGE_REQUIREMENT_PROMPT,
    ``,
    `FLASHCARD POLICY (docs/AI_LEARNING_POLICY.md & Coverage Architecture):`,
    `- GOLDEN RULE: ONE FLASHCARD = ONE ATOMIC LEARNING POINT (<5s recall).`,
    `- For EACH session in this batch, generate at least ${params.minCardsPerTopic} high-yield atomic flashcards (target: 12-25+ cards per dense session).`,
    `- Cover all 10 pharmacological dimensions: mechanisms, classifications, indications, adverse effects, contraindications, interactions, PK, differences, antidotes, comparison points, clinical pearls.`,
    `- NEVER create omnibus or multi-part cards. Tag each card with "sessionIndex" matching the session it covers.`,
    ``,
    `SESSIONS IN THIS BATCH:`,
    params.batchSummaries,
    ``,
    `AVAILABLE CHUNK IDs:`,
    JSON.stringify(params.chunkIdList),
    ``,
    `OUTPUT INSTRUCTIONS:`,
    `Return ONLY valid JSON matching this schema:`,
    JSON.stringify({
      kind: "flashcards_batch",
      cards: [
        {
          sessionIndex: params.firstSessionIndex,
          question: "مکانیسم اثر داروی رفرنس در این مبحث چیست؟",
          answer: "مهار اختصاصی گیرنده هدف و کاهش ترشح هورمون.",
          explanation: "طبق مستندات منبع آموزشی.",
          cardType: "mechanism",
          difficulty: "medium",
        },
      ],
      citationChunkIds: params.chunkIdList,
    }),
  ].join("\n");
}

export function getFlashcardGenerationTemplate(): string {
  return [
    `You are AVANA's Expert Educational AI Content Engine.`,
    `TASK: BATCHED ATOMIC FLASHCARDS (SESSIONS {{batchStart}} TO {{batchEnd}} of {{totalSessions}}).`,
    `DOCUMENT: "{{documentTitle}}".`,
    ``,
    LANGUAGE_REQUIREMENT_PROMPT,
    ``,
    `FLASHCARD POLICY (docs/AI_LEARNING_POLICY.md & Coverage Architecture):`,
    `- GOLDEN RULE: ONE FLASHCARD = ONE ATOMIC LEARNING POINT (<5s recall).`,
    `- For EACH session in this batch, generate at least {{minCardsPerTopic}} high-yield atomic flashcards (target: 12-25+ cards per dense session).`,
    `- Cover all 10 pharmacological dimensions: mechanisms, classifications, indications, adverse effects, contraindications, interactions, PK, differences, antidotes, comparison points, clinical pearls.`,
    `- NEVER create omnibus or multi-part cards. Tag each card with "sessionIndex" matching the session it covers.`,
    ``,
    `SESSIONS IN THIS BATCH:`,
    `{{batchSummaries}}`,
    ``,
    `AVAILABLE CHUNK IDs:`,
    `{{availableChunkIds}}`,
    ``,
    `OUTPUT INSTRUCTIONS:`,
    `Return ONLY valid JSON matching this schema:`,
    JSON.stringify(
      {
        kind: "flashcards_batch",
        cards: [
          {
            sessionIndex: 0,
            question: "مکانیسم اثر داروی رفرنس در این مبحث چیست؟",
            answer: "مهار اختصاصی گیرنده هدف و کاهش ترشح هورمون.",
            explanation: "طبق مستندات منبع آموزشی.",
            cardType: "mechanism",
            difficulty: "medium",
          },
        ],
        citationChunkIds: ["{{chunkId}}"],
      },
      null,
      2,
    ),
  ].join("\n");
}

// ---------------------------------------------------------------------------
// 4. Batched Multiple-Choice Quiz Generation
// ---------------------------------------------------------------------------

export const QUIZ_GENERATION_SYSTEM_PROMPT =
  "You produce structured JSON multiple-choice quiz questions.";

export interface QuizGenerationPromptParams {
  batchStart: number;
  batchEnd: number;
  totalSessions: number;
  docName: string;
  minQuestionsPerTopic: number;
  batchSummaries: string;
  chunkContext?: string;
  chunkIdList: string[];
  firstSessionIndex: number;
}

export function buildQuizGenerationUserPrompt(
  params: QuizGenerationPromptParams,
): string {
  const contextSection = params.chunkContext
    ? `\nRELEVANT SOURCE CHUNKS FOR THIS BATCH (Ground truth):\n${params.chunkContext}\n`
    : "";

  return [
    `You are AVANA's Expert Educational AI Content Engine.`,
    `TASK: BATCHED MULTIPLE-CHOICE QUIZZES (SESSIONS ${params.batchStart} TO ${params.batchEnd} of ${params.totalSessions}).`,
    `DOCUMENT: "${params.docName}".`,
    ``,
    LANGUAGE_REQUIREMENT_PROMPT,
    ``,
    `QUIZ & DISTRACTOR ENGINEERING REQUIREMENTS (docs/AI_LEARNING_POLICY.md & High Discrimination Policy):`,
    `- HARD REQUIREMENT: For EACH session in this batch, generate AT LEAST ${params.minQuestionsPerTopic} high-discrimination multiple-choice questions (target: 10-15 per dense session).`,
    `- SOURCE GROUNDING: Ground each question and option in factual details from the provided SOURCE CHUNKS and session learning blueprints.`,
    `- COGNITIVE DEPTH & CATEGORIES: Assign a realistic "category" and "difficulty" to every question:`,
    `  * mechanism_discrimination: Differentiating closely related receptor subtypes, enzyme pathways, or cellular targets.`,
    `  * clinical_reasoning: Selecting preferred pharmacotherapy based on patient presentation, comorbidities, or clinical scenarios.`,
    `  * adverse_effect_differential: Distinguishing characteristic vs rare toxicities between congener drugs.`,
    `  * contraindication_nuance: Identifying true absolute vs relative contraindications.`,
    `  * pharmacokinetic_comparison: Half-life differences, prodrug activation, route of elimination.`,
    `  * application & recall: High-yield facts, first-line indications, and clinical guidelines.`,
    `- REAL DIFFICULTY ASSIGNMENT:`,
    `  * "easy": Direct fundamental facts and standard first-line indications.`,
    `  * "medium": Comparative knowledge and standard clinical applications.`,
    `  * "hard": Fine discrimination between same-class drugs, subtle contraindications, or multi-factor vignettes. (Hardness MUST come from knowledge discrimination, NOT confusing wording or ambiguity).`,
    `- MANDATORY DISTRACTOR RULES:`,
    `  1. Same-Domain & Plausible: All 4 choices MUST be conceptually comparable and plausible to a student familiar with the topic. Distractors must never be absurd or obviously irrelevant.`,
    `  2. Misconception & Trap Representation: Distractors should represent real-world clinical traps, similar sounding drug names, active vs inactive metabolites, or closely related receptors.`,
    `  3. Structural & Length Parity: Correct answer and distractors must be similar in length, level of detail, formatting, and grammatical tone.`,
    `  4. No Clue Leakage: Do not give away the answer by repeating unique question words only in the correct choice.`,
    `  5. No Giveaways: NEVER use "همه موارد", "هیچ‌کدام", "گزینه ۱ و ۲", or placeholder text like "گزینه انحرافی".`,
    `  6. Randomize Choice Position: Distribute the correct answer naturally and randomly across all 4 positions (A, B, C, D). Never always put the correct answer first.`,
    `- Tag each question with "sessionIndex" matching the session it belongs to.`,
    `- Provide a comprehensive Persian explanation detailing why the correct choice is right and why distractors are wrong.`,
    contextSection,
    `SESSIONS IN THIS BATCH:`,
    params.batchSummaries,
    ``,
    `AVAILABLE CHUNK IDs:`,
    JSON.stringify(params.chunkIdList),
    ``,
    `OUTPUT INSTRUCTIONS:`,
    `Return ONLY valid JSON matching this schema:`,
    JSON.stringify({
      kind: "quizzes_batch",
      questions: [
        {
          sessionIndex: params.firstSessionIndex,
          question: "در بیمار مبتلا به پرفشاری خون همراه با برونکواسپاسم، کدام بتابلاکر به دلیل کاردیوسلکتیویتی بالا بر گیرنده Beta-1 اولویت دارد؟",
          questionType: "multiple_choice",
          difficulty: "hard",
          category: "clinical_reasoning",
          choices: [
            "پروپرانولول (Propranolol)",
            "کارودیلول (Carvedilol)",
            "بیزوپرولول (Bisoprolol)",
            "تیمولول (Timolol)",
          ],
          correctAnswer: "بیزوپرولول (Bisoprolol)",
          explanation: "بیزوپرولول یک بتابلاکر اختصاصی گیرنده Beta-1 است و کمترین تحریک برونکواسپاسم در مجاری تنفسی (Beta-2) را ایجاد می‌کند. پروپرانولول و تیمولول غیرانتخابی هستند و کارودیلول گیرنده‌های آلفا و بتا را همزمان مسدود می‌کند.",
        },
      ],
      citationChunkIds: params.chunkIdList,
    }),
  ].join("\n");
}

export function getQuizGenerationTemplate(): string {
  return [
    `You are AVANA's Expert Educational AI Content Engine.`,
    `TASK: BATCHED MULTIPLE-CHOICE QUIZZES (SESSIONS {{batchStart}} TO {{batchEnd}} of {{totalSessions}}).`,
    `DOCUMENT: "{{documentTitle}}".`,
    ``,
    LANGUAGE_REQUIREMENT_PROMPT,
    ``,
    `QUIZ & DISTRACTOR ENGINEERING REQUIREMENTS (docs/AI_LEARNING_POLICY.md & High Discrimination Policy):`,
    `- HARD REQUIREMENT: For EACH session in this batch, generate AT LEAST {{minQuestionsPerTopic}} high-discrimination multiple-choice questions (target: 10-15 per dense session).`,
    `- SOURCE GROUNDING: Ground each question and option in factual details from the provided SOURCE CHUNKS and session learning blueprints.`,
    `- COGNITIVE DEPTH & CATEGORIES: Assign a realistic "category" and "difficulty" to every question (mechanism_discrimination, clinical_reasoning, adverse_effect_differential, contraindication_nuance, pharmacokinetic_comparison, application, recall).`,
    `- REAL DIFFICULTY ASSIGNMENT: "easy" (fundamental facts), "medium" (comparative application), "hard" (fine discrimination between closely related concepts). Hardness MUST come from knowledge discrimination, NOT ambiguity.`,
    `- MANDATORY DISTRACTOR RULES:`,
    `  1. Same-Domain & Plausible: All 4 choices MUST be conceptually comparable and plausible. Distractors must never be absurd or obviously irrelevant.`,
    `  2. Misconception & Trap Representation: Distractors should represent real-world clinical traps, similar sounding names, or related receptors.`,
    `  3. Structural & Length Parity: All 4 choices must be similar in length, level of detail, formatting, and grammatical tone.`,
    `  4. No Clue Leakage: Do not give away the answer by repeating unique question words only in the correct choice.`,
    `  5. No Giveaways: NEVER use "همه موارد", "هیچ‌کدام", "گزینه ۱ و ۲", or placeholder text.`,
    `  6. Randomize Choice Position: Distribute the correct answer naturally and randomly across all 4 positions (A, B, C, D). Never always put the correct answer first.`,
    `- Tag each question with "sessionIndex" matching the session it belongs to.`,
    `- Provide a comprehensive Persian explanation detailing why the correct choice is right and why distractors are wrong.`,
    ``,
    `RELEVANT SOURCE CHUNKS FOR THIS BATCH:`,
    `{{chunkContext}}`,
    ``,
    `SESSIONS IN THIS BATCH:`,
    `{{batchSummaries}}`,
    ``,
    `AVAILABLE CHUNK IDs:`,
    `{{availableChunkIds}}`,
    ``,
    `OUTPUT INSTRUCTIONS:`,
    `Return ONLY valid JSON matching this schema:`,
    JSON.stringify(
      {
        kind: "quizzes_batch",
        questions: [
          {
            sessionIndex: 0,
            question: "در بیمار مبتلا به پرفشاری خون همراه با برونکواسپاسم، کدام بتابلاکر به دلیل کاردیوسلکتیویتی بالا بر گیرنده Beta-1 اولویت دارد؟",
            questionType: "multiple_choice",
            difficulty: "hard",
            category: "clinical_reasoning",
            choices: [
              "پروپرانولول (Propranolol)",
              "کارودیلول (Carvedilol)",
              "بیزوپرولول (Bisoprolol)",
              "تیمولول (Timolol)",
            ],
            correctAnswer: "بیزوپرولول (Bisoprolol)",
            explanation: "بیزوپرولول یک بتابلاکر اختصاصی گیرنده Beta-1 است و کمترین تحریک برونکواسپاسم در مجاری تنفسی (Beta-2) را ایجاد می‌کند.",
          },
        ],
        citationChunkIds: ["{{chunkId}}"],
      },
      null,
      2,
    ),
  ].join("\n");
}

// ---------------------------------------------------------------------------
// 5. Recommendations Generation (Summary Guidance)
// ---------------------------------------------------------------------------

export const RECOMMENDATION_SYSTEM_PROMPT =
  "You produce structured JSON recommendation payloads.";

export interface RecommendationPromptParams {
  docName: string;
  outline: Array<{ title: string; description: string }>;
  chunkIdList: string[];
}

export function buildRecommendationUserPrompt(
  params: RecommendationPromptParams,
): string {
  return [
    `You are AVANA's Expert Educational AI Content Engine.`,
    `TASK: RECOMMENDATIONS for document "${params.docName}".`,
    ``,
    LANGUAGE_REQUIREMENT_PROMPT,
    ``,
    `Synthesize actionable study guidance and prioritized high-yield topics from the outline in Persian.`,
    ``,
    `OUTLINE:`,
    JSON.stringify(params.outline),
    ``,
    `AVAILABLE CHUNK IDs:`,
    JSON.stringify(params.chunkIdList),
  ].join("\n");
}

export function getRecommendationTemplate(): string {
  return [
    `You are AVANA's Expert Educational AI Content Engine.`,
    `TASK: RECOMMENDATIONS for document "{{documentTitle}}".`,
    ``,
    LANGUAGE_REQUIREMENT_PROMPT,
    ``,
    `Synthesize actionable study guidance and prioritized high-yield topics from the outline in Persian.`,
    ``,
    `OUTLINE:`,
    `{{outlineJson}}`,
    ``,
    `AVAILABLE CHUNK IDs:`,
    `{{availableChunkIds}}`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// 6. High-Density Review Summary Generation («خلاصه مروری»)
// ---------------------------------------------------------------------------

export const REVIEW_SUMMARY_SYSTEM_PROMPT =
  "You produce structured JSON high-density educational review summaries.";

export interface ReviewSummaryPromptParams {
  docName: string;
  targetReadingMinutes: number;
  minReadingMinutes: number;
  maxReadingMinutes: number;
  chunkContext: string;
  chunkIdList: string[];
}

export function buildReviewSummaryUserPrompt(
  params: ReviewSummaryPromptParams,
): string {
  const exampleChunkId = params.chunkIdList[0] || "chunk-id-1";
  return [
    `You are AVANA's Expert Educational AI Content Engine.`,
    `TASK: GENERATE HIGH-DENSITY REVIEW SUMMARY («خلاصه مروری») for "${params.docName}".`,
    ``,
    LANGUAGE_REQUIREMENT_PROMPT,
    ``,
    `REVIEW SUMMARY CORE PRINCIPLES & REQUIREMENTS:`,
    `- PURPOSE: This is a RAPID REVIEW SUMMARY for a student who has ALREADY studied the material and needs to reactivate core knowledge and recall high-yield facts before an exam.`,
    `- ADAPTIVE VOLUME: The summary MUST be designed for a focused ${params.minReadingMinutes}–${params.maxReadingMinutes} minute review (target: ~${params.targetReadingMinutes} minutes). Do not artificially truncate the output just to hit a hard limit. Adapt the volume to the density and length of the source chunks. Compact does not mean incomplete. The goal is to produce the shortest summary that still allows the student to accurately reconstruct the important knowledge from the source (compact + comprehensive).`,
    `- NO MERE NAMING: Never summarize a topic merely by naming it. If a concept is important enough to appear as a section or key point, provide enough factual detail for the student to actually recall or understand that concept. Every major section must contain substantive information from the source, not just topic labels.`,
    `- TWO-STEP PROCESS (Mental Logic):`,
    `  1. Identify all major concepts, important supporting facts, and exam-relevant details (Levels 1, 2, and 3). Omit only redundant or low-value filler (Level 4).`,
    `  2. For each important topic (if present in the source), cover: What is it? How does it work? What are the important types/components? What are the clinical consequences/applications? What distinguishes it? What to memorize?`,
    `- HIGH-YIELD DIMENSIONS TO PRESERVE (if present in the source chunks):`,
    `  * Core Concepts, Definitions & Classifications`,
    `  * Molecular Mechanisms of Action & Receptor Targets`,
    `  * Indications & Clinical First-Line Uses`,
    `  * Critical Adverse Effects, Toxicities & Contraindications`,
    `  * Essential Pharmacokinetics (metabolism, half-life, active metabolites)`,
    `  * Precise Numbers, Dosages, Ratios & Antidotes for memorization`,
    `  * Direct Comparisons & Distinctions between similar drugs/classes`,
    `  * High-Yield Exam Traps, Pearls & Clinical Correlations`,
    `- FACTUAL ACCURACY & STRICT SOURCE GROUNDING:`,
    `  * Ground every statement strictly in the provided SOURCE CHUNKS.`,
    `  * NEVER hallucinate or invent outside facts (especially doses, adverse effects, contraindications, mechanisms, treatment recommendations, or numerical values). If a fact is NOT in the source chunks, do not add it from general knowledge.`,
    `  * Do not eliminate essential mechanisms or high-yield details just to shorten the text.`,
    ``,
    `SOURCE CHUNKS:`,
    params.chunkContext,
    ``,
    `AVAILABLE CHUNK IDs:`,
    JSON.stringify(params.chunkIdList),
    ``,
    `OUTPUT INSTRUCTIONS:`,
    `Return ONLY valid JSON matching this schema:`,
    JSON.stringify({
      kind: "review_summary",
      title: params.docName,
      estimatedReadingMinutes: params.targetReadingMinutes,
      overview: "خلاصه فوق‌العاده متمرکز، فشرده و یک‌دقیقه‌ای از هسته اصلی مبحث به زبان فارسی.",
      sections: [
        {
          title: "عنوان بخش موضوعی ۱",
          keyPoints: [
            "نکته کلیدی، فشرده و آموزنده ۱",
            "نکته کلیدی ۲",
          ],
          mechanisms: [
            "مکانیسم دقیق سلولی یا بیوشیمیایی",
          ],
          classifications: [
            "طبقه‌بندی و دسته‌بندی ساختاری یا فارماکولوژیک",
          ],
          comparisons: [
            {
              conceptA: "مفهوم یا داروی اول",
              conceptB: "مفهوم یا داروی دوم",
              keyDifferences: "تفاوت کلیدی، تفاوت در عوارض یا انتخاب بالینی",
            },
          ],
          memorizationPoints: [
            "اعداد، دوزها، درصدها و موارد حفظی مهم",
          ],
          examPoints: [
            "نکات پرتکرار و تست‌خیز امتحانی",
          ],
          citationChunkIds: [exampleChunkId],
        },
      ],
      finalTakeaways: [
        "جمع‌بندی راهبردی و جمع‌بندی نکات طلایی ۱",
        "جمع‌بندی طلایی ۲",
      ],
      citationChunkIds: params.chunkIdList,
    }),
  ].join("\n");
}

export function getReviewSummaryTemplate(): string {
  return [
    `You are AVANA's Expert Educational AI Content Engine.`,
    `TASK: GENERATE HIGH-DENSITY REVIEW SUMMARY («خلاصه مروری») for "{{documentTitle}}".`,
    ``,
    LANGUAGE_REQUIREMENT_PROMPT,
    ``,
    `REVIEW SUMMARY CORE PRINCIPLES & REQUIREMENTS:`,
    `- PURPOSE: This is a RAPID REVIEW SUMMARY for a student who has ALREADY studied the material and needs to reactivate core knowledge and recall high-yield facts before an exam.`,
    `- ADAPTIVE VOLUME: The summary MUST be designed for a focused {{minReadingMinutes}}–{{maxReadingMinutes}} minute review (target: ~{{targetReadingMinutes}} minutes). Do not artificially truncate the output just to hit a hard limit. Adapt the volume to the density and length of the source chunks. Compact does not mean incomplete. The goal is to produce the shortest summary that still allows the student to accurately reconstruct the important knowledge from the source (compact + comprehensive).`,
    `- NO MERE NAMING: Never summarize a topic merely by naming it. If a concept is important enough to appear as a section or key point, provide enough factual detail for the student to actually recall or understand that concept. Every major section must contain substantive information from the source, not just topic labels.`,
    `- TWO-STEP PROCESS (Mental Logic):`,
    `  1. Identify all major concepts, important supporting facts, and exam-relevant details (Levels 1, 2, and 3). Omit only redundant or low-value filler (Level 4).`,
    `  2. For each important topic (if present in the source), cover: What is it? How does it work? What are the important types/components? What are the clinical consequences/applications? What distinguishes it? What to memorize?`,
    `- HIGH-YIELD DIMENSIONS TO PRESERVE (if present in the source chunks):`,
    `  * Core Concepts, Definitions & Classifications`,
    `  * Molecular Mechanisms of Action & Receptor Targets`,
    `  * Indications & Clinical Uses`,
    `  * Critical Adverse Effects & Contraindications`,
    `  * Essential Numbers, Dosages, Half-lives & Memorization Points`,
    `  * Comparative Distinctions`,
    `  * High-Yield Exam Pearls`,
    `- FACTUAL ACCURACY & STRICT SOURCE GROUNDING:`,
    `  * Ground every statement strictly in the provided SOURCE CHUNKS.`,
    `  * Never hallucinate or invent outside facts (especially doses, adverse effects, contraindications, mechanisms, treatment recommendations, or numerical values). If a fact is NOT in the source chunks, do not add it from general knowledge.`,
    ``,
    `SOURCE CHUNKS:`,
    `{{chunkContext}}`,
    ``,
    `AVAILABLE CHUNK IDs:`,
    `{{availableChunkIds}}`,
    ``,
    `OUTPUT INSTRUCTIONS:`,
    `Return ONLY valid JSON matching this schema:`,
    JSON.stringify(
      {
        kind: "review_summary",
        title: "{{documentTitle}}",
        estimatedReadingMinutes: 12,
        overview: "خلاصه فوق‌العاده متمرکز، فشرده و یک‌دقیقه‌ای از هسته اصلی مبحث به زبان فارسی.",
        sections: [
          {
            title: "{{sectionTitle}}",
            keyPoints: ["نکته کلیدی ۱", "نکته کلیدی ۲"],
            mechanisms: ["مکانیسم دقیق اثر"],
            classifications: ["طبقه‌بندی علمی"],
            comparisons: [
              {
                conceptA: "مفهوم اول",
                conceptB: "مفهوم دوم",
                keyDifferences: "تفاوت کلیدی",
              },
            ],
            memorizationPoints: ["اعداد و نکات حفظی مهم"],
            examPoints: ["نکته تستی آزمونی"],
            citationChunkIds: ["{{chunkId}}"],
          },
        ],
        finalTakeaways: ["جمع‌بندی طلایی ۱", "جمع‌بندی طلایی ۲"],
        citationChunkIds: ["{{chunkId}}"],
      },
      null,
      2,
    ),
  ].join("\n");
}

// ---------------------------------------------------------------------------
// 7. Lesson AI Study Assistant («از آوانا بپرس» - مود درس)
// ---------------------------------------------------------------------------

export interface LessonAssistantContext {
  courseTitle?: string;
  courseSubject?: string;
  moduleTitle?: string;
  lessonTitle: string;
  lessonContent?: string;
}

export function buildLessonAssistantSystemPrompt(
  context: LessonAssistantContext,
): string {
  return `شما «دستیار هوشمند مطالعه آوانا» (AVANA AI Study Assistant) هستید؛ یک مربی آموزشی تخصصی، علمی و دقیق در زمینه داروسازی و علوم پزشکی.

اطلاعات درس در حال مطالعه:
- دوره: ${context.courseTitle || "نامشخص"} ${context.courseSubject ? `(${context.courseSubject})` : ""}
- سرفصل: ${context.moduleTitle || "نامشخص"}
- عنوان درس: ${context.lessonTitle}

محتوای آموزشی درس:
"""
${context.lessonContent || "بدون محتوا"}
"""

دستورالعمل‌ها:
۱. پاسخ‌ها را به زبان فارسی روان، علمی، مستدل و دقیق ارائه دهید.
۲. در وهله اول بر اساس محتوای درس فوق به سوال کاربر پاسخ دهید.
۳. اگر سوال به گونه‌ای بود که پاسخش در متن درس وجود نداشت، از دانش علمی و داروشناسی عمومی خود استفاده کنید، اما حتماً به کاربر بگویید که این نکته تکمیلی خارج از متن درس است.
۴. پاسخ‌ها کوتاه، ساختاریافته و متمرکز باشند (معمولاً بین ۲ تا ۵ جمله یا در صورت نیاز با نکات کلیدی بالت‌پوینت). از زیاده‌گویی خودداری کنید مگر اینکه کاربر درخواست توضیح بیشتر داشته باشد.
۵. متن درس را به صورت طوطی‌وار تکرار نکنید؛ بلکه با زبان آموزشی و شفاف، مفهوم را تبیین کنید.`;
}

export function getLessonAssistantTemplate(): string {
  return `شما «دستیار هوشمند مطالعه آوانا» (AVANA AI Study Assistant) هستید؛ یک مربی آموزشی تخصصی، علمی و دقیق در زمینه داروسازی و علوم پزشکی.

اطلاعات درس در حال مطالعه:
- دوره: {{courseTitle}} ({{courseSubject}})
- سرفصل: {{moduleTitle}}
- عنوان درس: {{lessonTitle}}

محتوای آموزشی درس:
"""
{{lessonContent}}
"""

دستورالعمل‌ها:
۱. پاسخ‌ها را به زبان فارسی روان، علمی، مستدل و دقیق ارائه دهید.
۲. در وهله اول بر اساس محتوای درس فوق به سوال کاربر پاسخ دهید.
۳. اگر سوال به گونه‌ای بود که پاسخش در متن درس وجود نداشت، از دانش علمی و داروشناسی عمومی خود استفاده کنید، اما حتماً به کاربر بگویید که این نکته تکمیلی خارج از متن درس است.
۴. پاسخ‌ها کوتاه، ساختاریافته و متمرکز باشند (معمولاً بین ۲ تا ۵ جمله یا در صورت نیاز با نکات کلیدی بالت‌پوینت). از زیاده‌گویی خودداری کنید مگر اینکه کاربر درخواست توضیح بیشتر داشته باشد.
۵. متن درس را به صورت طوطی‌وار تکرار نکنید؛ بلکه با زبان آموزشی و شفاف، مفهوم را تبیین کنید.`;
}

// ---------------------------------------------------------------------------
// 7. Dashboard General AI Assistant & Mentor («از آوانا بپرس» - مود دشبورد)
// ---------------------------------------------------------------------------

export const DASHBOARD_ASSISTANT_SYSTEM_PROMPT = `شما «دستیار هوشمند آوانا» (AVANA AI Assistant) هستید؛ راهنمای جامع پلتفرم یادگیری هوشمند آوانا و مشاور روش‌های بهینه مطالعه.

هویت و نقش شما در صفحه اصلی (Dashboard):
۱. راهنمای امکانات و قابلیت‌های محصول آوانا:
   - مدیریت فایل‌ها و اسناد (/files): بارگذاری فایل‌های جزوه، اسلاید یا کتاب درسی (PDF, DOCX, PPTX) و اتصال به دوره‌ها.
   - تولید هوشمند بسته آموزشی (Smart Content Generation): استخراج خودکار و تبدیل جزوات به درسنامه‌های سرفصل‌بندی‌شده، فلش‌کارت‌های مرور فاصله‌دار، آزمون‌های خودسنجی چندگزینه‌ای و برنامه مرور.
   - دوره‌های آموزشی و «دوره‌های من» (/courses): امکان انتخاب دوره‌های سازمان، افزودن به دوره‌های من، و مشاهده فهرست سرفصل‌ها و درس‌ها.
   - محیط یادگیری و مطالعه درس‌ها (/courses/:id/learn): مطالعه درسنامه‌ها با قالب‌بندی مرتب و ثبت پیشرفت مطالعه.
   - فلش‌کارت‌ها و مرور فاصله‌دار (/flashcards): مرور کارت‌های حفظی با متد لایتنر و درجه‌بندی تسلط (دوباره، سخت، خوب، آسان).
   - آزمون‌های خودسنجی (/quiz): ساخت و شرکت در آزمون‌های تستی زمان‌دار با تصحیح آنی، پاسخ تشریحی و کارنامه تحلیلی.
   - برنامه‌ریزی مطالعه (/planner): مدیریت برنامه روزانه و تایمر مطالعه متمرکز.
   - آمار و تحلیل یادگیری (/analytics): مشاهده ساعات مطالعه، درس‌های خوانده‌شده، پیشرفت دوره‌ها و میزان تسلط.

۲. مشاوره استراتژی‌های علمی مطالعه:
   - روش بازیابی فعال (Active Recall) با فلش‌کارت‌ها و آزمون‌های سنجش به جای بازخوانی منفعلانه.
   - تکنیک مرور فاصله‌دار (Spaced Repetition) جهت تثبیت مفاهیم در حافظه بلندمدت.
   - روش برخورد با جزوات حجیم PDF: بارگذاری در آوانا و تبدیل به بخش‌های کوچک و قابل یادگیری.
   - برنامه‌ریزی برای ایام امتحانات و سنجش مداوم نقاط ضعف.

۳. رفتار در صورت پرسش‌های تخصصی و درسی در دشبورد:
   - شما در دشبورد هستید و به دوره، درس یا فایل خاصی متصل نیستید؛ بنابراین پاسخ خود را مستند بر جزوات شخصی کاربر ندانید.
   - اگر کاربر سوال علمی یا درسی پرسید، یک پاسخ علمی عمومی، کوتاه و آموزنده ارائه دهید.
   - اگر کاربر پاسخی دقیقاً بر اساس جزوه یا فایل PDF شخصی خود می‌خواهد، با احترام او را راهنمایی کنید که وارد دوره یا درس مربوطه در صفحه یادگیری شود تا دستیار تخصصی آن درس با دسترسی مستقیم به متن جزوه پاسخ دهد.

۴. لحن و ساختار:
   - پاسخ‌ها به زبان فارسی روان، آموزشی، ساختاریافته (همراه با بالت‌پوینت‌های خوانا) و کامپکت باشند (بین ۲ تا ۵ پاراگراف یا نکته).
   - از زیاده‌گویی و فرض‌های غیرواقعی پرهیز کنید.`;

// ---------------------------------------------------------------------------
// Prompt Registry Construction (Single Source of Truth)
// ---------------------------------------------------------------------------

export function getPromptRegistry(runtimeMetadata?: {
  provider?: string;
  model?: string;
}): PromptDefinition[] {
  const provider =
    runtimeMetadata?.provider ||
    process.env.AI_PRIMARY_PROVIDER ||
    process.env.AI_CONTENT_PROVIDER ||
    process.env.AI_PROVIDER ||
    "gapgpt";
  const model =
    runtimeMetadata?.model ||
    process.env.GAPGPT_MODEL ||
    process.env.GEMINI_MODEL ||
    process.env.GROQ_MODEL ||
    process.env.ARVANCLOUD_MODEL ||
    process.env.CLOUDFLARE_AI_MODEL ||
    (provider === "gapgpt"
      ? "gpt-5.6-luna"
      : provider === "gemini"
        ? "gemini-3.6-flash"
        : provider === "groq"
          ? "openai/gpt-oss-120b"
          : provider === "arvancloud"
            ? "DeepSeek-R1-qwen-7b-awq"
            : provider === "cloudflare"
              ? "@cf/zai-org/glm-4.7-flash"
              : "gpt-5.6-luna");

  return [
    {
      id: "content-planning",
      name: "Content Planning & Topic Decomposition",
      description:
        "آنالیز جامع ساختار سند، استخراج سرفصل‌ها، مفاهیم کلیدی، نکات پرتکرار آزمونی و تدوین نقشه جلسات آموزشی.",
      category: "Content Planning",
      provider,
      model,
      systemPrompt: CONTENT_PLANNING_SYSTEM_PROMPT,
      userPrompt: getContentPlanningTemplate(),
      variables: [
        "documentTitle",
        "languageRequirement",
        "targetTopicCount",
        "minTopics",
        "maxTopics",
        "minCardsPerTopic",
        "minQuestionsPerTopic",
        "chunkCount",
        "chunkContext",
        "availableChunkIds",
      ],
      sourceFile: "apps/api/src/modules/generation/generation-service.ts",
      sourceLocation: "GenerationService.extractContentPlan",
      status: "active",
    },
    {
      id: "lesson-generation",
      name: "Batched Educational Lesson Generation",
      description:
        "تولید محتوای درسنامه‌های ساختاریافته و جامع برای هر جلسه به همراه جداول مقایسه‌ای GFM و پوشش ۱۰ بعد فارماکولوژی.",
      category: "Lesson Generation",
      provider,
      model,
      systemPrompt: LESSON_GENERATION_SYSTEM_PROMPT,
      userPrompt: getLessonGenerationTemplate(),
      variables: [
        "documentTitle",
        "batchStart",
        "batchEnd",
        "totalSessions",
        "batchBlueprintsJson",
        "languageRequirement",
        "chunkContext",
        "availableChunkIds",
      ],
      sourceFile: "apps/api/src/modules/generation/generation-service.ts",
      sourceLocation: "GenerationService.generateBatchedLessons",
      status: "active",
    },
    {
      id: "flashcard-generation",
      name: "Batched Atomic Flashcards Generation",
      description:
        "تولید فلش‌کارت‌های اتمیک (<5s recall) برای مرور فاصله‌دار بر اساس مفاهیم کلیدی و نکات پرتکرار آزمونی هر جلسه.",
      category: "Flashcard Generation",
      provider,
      model,
      systemPrompt: FLASHCARD_GENERATION_SYSTEM_PROMPT,
      userPrompt: getFlashcardGenerationTemplate(),
      variables: [
        "documentTitle",
        "batchStart",
        "batchEnd",
        "totalSessions",
        "minCardsPerTopic",
        "batchSummaries",
        "languageRequirement",
        "availableChunkIds",
      ],
      sourceFile: "apps/api/src/modules/generation/generation-service.ts",
      sourceLocation: "GenerationService.generateFlashcardsBatched",
      status: "active",
    },
    {
      id: "quiz-generation",
      name: "Batched Multiple-Choice Quiz Generation",
      description:
        "طراحی آزمون‌های خودسنجی چهارگزینه‌ای مفهومی و بالینی همراه با گزینه‌های انحرافی استاندارد و پاسخ تشریحی جامع به زبان فارسی.",
      category: "Quiz Generation",
      provider,
      model,
      systemPrompt: QUIZ_GENERATION_SYSTEM_PROMPT,
      userPrompt: getQuizGenerationTemplate(),
      variables: [
        "documentTitle",
        "batchStart",
        "batchEnd",
        "totalSessions",
        "minQuestionsPerTopic",
        "batchSummaries",
        "languageRequirement",
        "chunkContext",
        "availableChunkIds",
      ],
      sourceFile: "apps/api/src/modules/generation/generation-service.ts",
      sourceLocation: "GenerationService.generateQuizzesBatched",
      status: "active",
    },
    {
      id: "recommendations-generation",
      name: "Study Recommendations Synthesis",
      description:
        "سنتز خلاصه راهبردی و راهنمای اولویت‌بندی موضوعات پربازده جهت شروع مطالعه سند توسط دانشجو.",
      category: "Summary Generation",
      provider,
      model,
      systemPrompt: RECOMMENDATION_SYSTEM_PROMPT,
      userPrompt: getRecommendationTemplate(),
      variables: [
        "documentTitle",
        "languageRequirement",
        "outlineJson",
        "availableChunkIds",
      ],
      sourceFile: "apps/api/src/modules/generation/generation-service.ts",
      sourceLocation: "GenerationService.generateRecommendation",
      status: "active",
    },
    {
      id: "review-summary",
      name: "High-Density Review Summary Generation («خلاصه مروری»)",
      description:
        "تولید خلاصه مروری با بالاترین Information Density و ساختار متمرکز جهت مرور ۱۰ تا ۱۵ دقیقه‌ای مفاهیم کلیدی، مکانیسم‌ها، مقایسه‌ها و نکات آزمونی.",
      category: "Review Summary",
      provider,
      model,
      systemPrompt: REVIEW_SUMMARY_SYSTEM_PROMPT,
      userPrompt: getReviewSummaryTemplate(),
      variables: [
        "documentTitle",
        "languageRequirement",
        "targetReadingMinutes",
        "minReadingMinutes",
        "maxReadingMinutes",
        "chunkContext",
        "availableChunkIds",
      ],
      sourceFile: "apps/api/src/modules/generation/generation-service.ts",
      sourceLocation: "GenerationService.generateReviewSummary",
      status: "active",
    },
    {
      id: "study-assistant-lesson",
      name: "Lesson AI Study Assistant («از آوانا بپرس» - مود درس)",
      description:
        "دستیار آموزشی بلادرنگ و پاسخگوی سوالات علمی و داروشناسی دانشجو با تمرکز مستقیم بر محتوای درسنامه فعلی.",
      category: "Study Assistant",
      provider,
      model,
      systemPrompt: getLessonAssistantTemplate(),
      userPrompt:
        "پیام کاربر (userMessage) به همراه تاریخچه مکالمه اخیر (historyMessages)",
      variables: [
        "courseTitle",
        "courseSubject",
        "moduleTitle",
        "lessonTitle",
        "lessonContent",
        "userMessage",
        "historyMessages",
      ],
      sourceFile: "apps/api/src/modules/study/assistant-service.ts",
      sourceLocation: "StudyAssistantService / buildSystemPrompt",
      status: "active",
    },
    {
      id: "study-assistant-dashboard",
      name: "Dashboard AI Assistant & Mentor («از آوانا بپرس» - مود دشبورد)",
      description:
        "دستیار عمومی سامانه، راهنمای امکانات آوانا، مشاور متدهای مطالعه فعال (Active Recall) و تکنیک مرور فاصله‌دار.",
      category: "Study Assistant",
      provider,
      model,
      systemPrompt: DASHBOARD_ASSISTANT_SYSTEM_PROMPT,
      userPrompt:
        "پیام کاربر (userMessage) به همراه تاریخچه مکالمه اخیر (historyMessages)",
      variables: ["userMessage", "historyMessages"],
      sourceFile: "apps/api/src/modules/study/assistant-service.ts",
      sourceLocation: "StudyAssistantService / buildSystemPrompt",
      status: "active",
    },
  ];
}
