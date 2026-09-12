/**
 * AVANA Prompt Registry & Single Source of Truth (PR6-Prompt-Inspector).
 *
 * This module is the sole source of truth for all production AI prompts
 * across the AVANA platform:
 * - Content Planning & Topic Decomposition
 * - Batched Educational Lessons
 * - Batched Atomic Flashcards
 * - Batched Multiple-Choice Quizzes
 * - Stage 5: High-Density Review Summary Generation («خلاصه مروری»)
 * - Lesson AI Study Assistant («از آوانا بپرس»)
 * - Dashboard General AI Assistant & Mentor
 *
 * Architecture Rule:
 * GenerationService and StudyAssistantService consume prompt constants and
 * builders directly from this module. The Prompt Inspector API exposes them
 * read-only to administrators without duplication or drift.
 */

import {
  type ReviewSummaryGenerationInput,
  cleanEducationalTitle,
} from "@avana/domain";

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
  ``,
  `MANDATORY SCIENTIFIC FORMATTING & MATH NOTATION POLICY:`,
  `- Plain Scientific & Medical Terms: Write all gene names, protein symbols, hormones, enzyme acronyms, receptors, and drug abbreviations (e.g. 'ACTH', 'GH', 'TSH', 'LH', 'hsp40', 'hsp70', 'FKBP5', 'COX-2', 'cAMP', 'ACE') as standard PLAIN TEXT in Persian or English.`,
  `  * NEVER wrap scientific terms, gene/protein names, or medical abbreviations in markdown backticks (do NOT write \`hsp40\` or \`ACTH\`). Backticks are reserved strictly for computer code.`,
  `  * NEVER wrap plain acronyms in LaTeX \\text{...} commands (do NOT write \\text{ACTH} or $\\text{ACTH}$).`,
  `- Mathematical & Chemical Notation: Use standard LaTeX math notation ONLY for genuine mathematical, pharmacokinetic, chemical, or formula expressions:`,
  `  * Subscripts and superscripts: $T_4$, $T_3$, $Ca^{2+}$, $10^{-3}$, $H_2O$`,
  `  * Greek letters: $\\alpha_1$, $\\beta_1$, $\\gamma$`,
  `  * Fractions and formulas: $V_d = \\frac{\\text{Dose}}{C_0}$, $\\text{CL} = \\frac{U \\times V}{P}$`,
  `  * Use \\text{...} ONLY when descriptive text words appear INSIDE a larger mathematical equation (e.g. $V_{\\text{max}}$).`,
  `- JSON Escape Rule: In JSON output, always properly double-escape LaTeX backslashes as '\\\\' (e.g. "$\\beta_1$", "$\\frac{a}{b}$") so that valid JSON encoding is preserved.`,
  ``,
  `MANDATORY ZERO-EMOJI & SEMANTIC CALLOUT POLICY:`,
  `- NEVER use emojis, stickers, or graphical icons (such as ⚠️, 💡, 🧠, 📌, 💊, 🚨, ❗, ❌, ✅, ⛔, 🚫, 🔑, etc.) anywhere in generated educational content, titles, headings, questions, choices, explanations, or callouts.`,
  `- When presenting pedagogical highlights (warnings, common student misconceptions, clinical pearls, contraindications, key points, or supplementary notes), format them STRICTLY as clean semantic Markdown callouts WITHOUT any emojis:`,
  `  * Warning / هشدار: > **هشدار:** متن...`,
  `  * Common Mistake / اشتباه رایج: > **اشتباه رایج:** این مورد را با … اشتباه نگیرید؛ تفاوت اصلی در … است.`,
  `  * Important / نکته مهم: > **نکته مهم:** متن...`,
  `  * Clinical Point / نکته بالینی: > **نکته بالینی:** متن...`,
  `  * Contraindication / منع مصرف: > **منع مصرف:** متن...`,
  `  * Key Point / نکته کلیدی: > **نکته کلیدی:** متن...`,
  `  * Educational Tip / نکته آموزشی: > **نکته آموزشی:** متن...`,
  `  * Understanding / برای فهم بهتر: > **برای فهم بهتر:** متن...`,
  `  * Supplementary / توضیح تکمیلی: > **توضیح تکمیلی:** متن...`,
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

export function getContentPlanningTemplate(): string {
  return [
    `You are AVANA’s Expert Educational AI Content Engine.`,
    ``,
    `TASK: COVERAGE-FIRST CONTENT PLANNING & PEDAGOGICAL DECOMPOSITION for “{{documentTitle}}”.`,
    ``,
    `Your ONLY responsibility in this stage is to analyze the provided source chunks and create a high-quality educational blueprint for downstream content generation.`,
    ``,
    `DO NOT generate lessons, lesson text, flashcards, quizzes, questions, answers, or recommendations in this stage.`,
    ``,
    `⸻`,
    ``,
    `1. CORE PRINCIPLE: SOURCE STRUCTURE ≠ LEARNING STRUCTURE`,
    ``,
    `The source document is the scientific source, not the required educational structure.`,
    ``,
    `DO NOT simply follow:`,
    ``,
    `* PDF headings`,
    `* page order`,
    `* chapter order`,
    `* chunk boundaries`,
    `* the order in which information appears`,
    ``,
    `Instead, independently determine the most effective educational structure for a pharmacy student.`,
    ``,
    `You may:`,
    ``,
    `* combine related material from multiple chunks into one session,`,
    `* reorganize concepts into a more logical learning sequence,`,
    `* separate large or conceptually distinct subjects into different sessions,`,
    `* connect related concepts that are separated in the source.`,
    ``,
    `The goal is not to reproduce the document structure.`,
    ``,
    `The goal is to create the BEST LEARNING STRUCTURE while maintaining COMPLETE SOURCE COVERAGE.`,
    ``,
    `⸻`,
    ``,
    `2. MANDATORY LANGUAGE REQUIREMENT`,
    ``,
    `Regardless of the source language (English, Persian, or mixed), generate all output in fluent, natural, high-standard academic Persian.`,
    ``,
    `For important medical and scientific terms:`,
    ``,
    `* use the standard Persian term,`,
    `* and include the standard English term in parentheses when useful.`,
    ``,
    `Example:`,
    `“پرفشاری خون اولیه (Primary / Essential Hypertension)”`,
    ``,
    `Do not unnecessarily leave sentences or explanations in English.`,
    ``,
    `⸻`,
    ``,
    `3. COMPLETE CONTENT COVERAGE`,
    ``,
    `Analyze ALL provided source chunks and identify all educationally meaningful material.`,
    ``,
    `Consider, when applicable:`,
    ``,
    `* Core concepts and classifications`,
    `* Definitions and terminology`,
    `* Mechanisms of action`,
    `* Molecular receptors and targets`,
    `* Pharmacodynamic and physiological effects`,
    `* Therapeutic indications and clinical uses`,
    `* Adverse effects and toxicities`,
    `* Contraindications`,
    `* Drug-drug and drug-food interactions`,
    `* Pharmacokinetic properties`,
    `* Absorption, distribution, metabolism and elimination`,
    `* Antidotes and toxicity management`,
    `* Drug-specific differences`,
    `* Important comparisons`,
    `* Clinical applications`,
    `* Clinical pearls`,
    `* High-yield examination facts`,
    `* Important exceptions and distinctions`,
    `* Relationships between concepts`,
    ``,
    `Do not omit educationally meaningful information merely because it appears in a small or isolated chunk.`,
    ``,
    `⸻`,
    ``,
    `4. SESSION DECOMPOSITION`,
    ``,
    `Create distinct, substantive learning sessions based on educational coherence.`,
    ``,
    `A SESSION is a complete learning unit that can be taught and studied independently while still fitting logically into the overall module.`,
    ``,
    `Determine session boundaries using:`,
    ``,
    `* conceptual coherence,`,
    `* logical learning progression,`,
    `* relationship between concepts,`,
    `* subject complexity,`,
    `* amount and density of information,`,
    `* clinical relevance,`,
    `* and the amount of material required for meaningful understanding.`,
    ``,
    `Avoid:`,
    ``,
    `* artificially splitting closely related concepts,`,
    `* creating shallow sessions containing only a few facts,`,
    `* combining unrelated concepts merely to reduce the session count,`,
    `* repeating the same material across multiple sessions without a genuine educational reason.`,
    ``,
    `A session may contain information from multiple source chunks.`,
    ``,
    `A source chunk may contribute to multiple sessions ONLY when different parts of that chunk genuinely support different learning units.`,
    ``,
    `⸻`,
    ``,
    `5. SESSION COUNT`,
    ``,
    `Target session count: {{targetTopicCount}}`,
    ``,
    `Allowed range: {{minTopics}} to {{maxTopics}}`,
    ``,
    `{{targetTopicCount}} is a TARGET, not a reason to create artificial sessions.`,
    ``,
    `Prioritize session quality in this order:`,
    ``,
    `1. Complete coverage of source material`,
    `2. Educational coherence`,
    `3. Appropriate depth and density`,
    `4. Logical learning progression`,
    `5. Target session count`,
    ``,
    `If the source naturally requires a different number of sessions within the allowed range, prefer the more educationally appropriate structure rather than artificially forcing the target.`,
    ``,
    `Never compress a rich subject into an inadequate session simply to satisfy the target count.`,
    ``,
    `⸻`,
    ``,
    `6. SOURCE TOPICS`,
    ``,
    `sourceTopics represent the major subject areas actually present in the source.`,
    ``,
    `They describe WHAT the source contains.`,
    ``,
    `They are NOT the final learning sessions.`,
    ``,
    `A source topic may:`,
    ``,
    `* span multiple sessions,`,
    `* be combined with another source topic,`,
    `* or contribute concepts to multiple sessions.`,
    ``,
    `Keep sourceTopics broad and meaningful. Do not create a source topic for every small concept or paragraph.`,
    ``,
    `⸻`,
    ``,
    `7. SESSIONS`,
    ``,
    `sessions represent the educational structure designed by the AI.`,
    ``,
    `They describe HOW the material should be organized for learning.`,
    ``,
    `Each session must have:`,
    ``,
    `* a clear and specific title,`,
    `* a meaningful description,`,
    `* a coherent set of core concepts,`,
    `* accurate source grounding,`,
    `* and enough substantive material to support a complete lesson in the next generation stage.`,
    ``,
    `Each session must be independently understandable from its blueprint.`,
    ``,
    `Do not make one session dependent on another merely because they share the same source chunk.`,
    ``,
    `⸻`,
    ``,
    `8. CORE CONCEPTS`,
    ``,
    `coreConcepts are the major learning concepts that must be taught within each session.`,
    ``,
    `A core concept should represent a meaningful conceptual or clinical learning unit.`,
    ``,
    `Examples include:`,
    ``,
    `* a mechanism,`,
    `* a drug/class,`,
    `* a physiological relationship,`,
    `* a clinical decision,`,
    `* an important distinction,`,
    `* an adverse-effect pattern,`,
    `* a pharmacokinetic principle,`,
    `* or a clinically relevant comparison.`,
    ``,
    `Do NOT create one core concept for every sentence, isolated fact, or minor detail.`,
    ``,
    `Do NOT artificially limit the number of core concepts.`,
    ``,
    `The number of core concepts should reflect the actual conceptual density of the session.`,
    ``,
    `Every core concept must be grounded in one or more source chunks.`,
    ``,
    `⸻`,
    ``,
    `9. CHUNK COVERAGE AND GROUNDING`,
    ``,
    `Every available chunk MUST be accounted for.`,
    ``,
    `Coverage rules:`,
    ``,
    `* Every ID in {{availableChunkIds}} MUST appear in at least one session’s relevantChunkIds.`,
    `* No available chunk may be silently omitted.`,
    `* relevantChunkIds must represent chunks that materially support the session.`,
    `* Do not attach chunks merely to satisfy the coverage requirement.`,
    `* A chunk may appear in multiple sessions only when its content genuinely contributes to each session.`,
    `* Every coreConcept.sourceChunkIds MUST contain only valid available chunk IDs.`,
    `* Every chunk supporting a core concept SHOULD also appear in that session’s relevantChunkIds.`,
    `* citationChunkIds MUST contain every unique chunk ID referenced anywhere in the plan.`,
    ``,
    `The chunk mapping must be semantically meaningful, not mechanical.`,
    ``,
    `⸻`,
    ``,
    `10. SOURCE-BASED VS EDUCATIONAL ORGANIZATION`,
    ``,
    `The AI is allowed to reorganize information for educational clarity.`,
    ``,
    `For example, information about the same drug or concept may appear in several different chunks. You may combine those chunks into one session when doing so creates a more complete and coherent learning unit.`,
    ``,
    `Likewise, if one chunk contains multiple unrelated concepts, you may distribute that chunk across multiple sessions when genuinely necessary.`,
    ``,
    `The objective is:`,
    ``,
    `SOURCE CONTENT → COMPLETE UNDERSTANDING`,
    ``,
    `not:`,
    ``,
    `SOURCE CHUNKS → ONE SESSION EACH`,
    ``,
    `⸻`,
    ``,
    `11. HIGH-YIELD FACTS`,
    ``,
    `Identify genuinely high-yield facts supported by the source.`,
    ``,
    `A high-yield fact may be:`,
    ``,
    `* clinically important,`,
    `* safety-critical,`,
    `* highly testable,`,
    `* a common source of confusion,`,
    `* a key distinction,`,
    `* or especially important for understanding related concepts.`,
    ``,
    `Do not invent facts.`,
    ``,
    `Do not import unsupported medical information into highYieldFacts.`,
    ``,
    `If a fact is supported by multiple chunks, include the appropriate session association and ensure the referenced chunks are represented in the session grounding.`,
    ``,
    `⸻`,
    ``,
    `12. DOWNSTREAM GENERATION GUIDANCE`,
    ``,
    `The resulting blueprint will be used by later stages to independently generate:`,
    ``,
    `* complete lessons,`,
    `* atomic flashcards,`,
    `* assessment questions,`,
    `* recommendations,`,
    `* and review material.`,
    ``,
    `Therefore, the blueprint must be sufficiently precise to tell downstream stages:`,
    ``,
    `* what this session is about,`,
    `* what concepts must be covered,`,
    `* which source chunks support it,`,
    `* and what content depth is expected.`,
    ``,
    `Do not attempt to generate that downstream content here.`,
    ``,
    `⸻`,
    ``,
    `13. CONTENT DEPTH TARGETS`,
    ``,
    `targetFlashcardCount and targetQuizCount are planning estimates for downstream stages.`,
    ``,
    `They are NOT actual generated content.`,
    ``,
    `Set them according to the conceptual density of each session.`,
    ``,
    `Do not use the same number mechanically for every session when the sessions have substantially different information density.`,
    ``,
    `Minimum targets:`,
    ``,
    `* Flashcards: at least {{minCardsPerTopic}} per session`,
    `* Questions: at least {{minQuestionsPerTopic}} per session`,
    ``,
    `Dense sessions may require substantially more flashcards or questions.`,
    ``,
    `⸻`,
    ``,
    `14. OUTPUT VALIDITY`,
    ``,
    `Return ONLY valid JSON.`,
    ``,
    `Do not include:`,
    ``,
    `* Markdown fences`,
    `* explanations before the JSON`,
    `* explanations after the JSON`,
    `* comments`,
    `* trailing commas`,
    `* invalid JSON`,
    ``,
    `All IDs must be unique within their respective collections.`,
    ``,
    `Session indexes MUST start at 0 and increase sequentially.`,
    ``,
    `All chunk IDs MUST come from the provided available chunk IDs.`,
    ``,
    `⸻`,
    ``,
    `SOURCE CHUNKS:`,
    `{{chunkContext}}`,
    ``,
    `AVAILABLE CHUNK IDs:`,
    `{{availableChunkIds}}`,
    ``,
    `Return ONLY this JSON structure:`,
    ``,
    JSON.stringify(
      {
        kind: "content_plan",
        moduleTitle: "عنوان جامع و مناسب ماژول آموزشی به فارسی",
        sourceTopics: [
          {
            id: "source-topic-1",
            title: "عنوان مبحث اصلی منبع",
            description: "شرح دقیق و کوتاه مبحث",
            category: "pharmacology",
            relevantChunkIds: ["{{chunkId}}"],
          },
        ],
        sessions: [
          {
            index: 0,
            title: "جلسه ۱: عنوان دقیق و آموزشی جلسه",
            description: "شرح محدوده، هدف و محتوای آموزشی جلسه",
            coreConcepts: [
              {
                id: "session-0-concept-1",
                name: "نام مفهوم یا دارو",
                category: "mechanism",
                description: "شرح کوتاه و دقیق مفهوم",
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
            fact: "نکته مهم آزمونی یا بالینی",
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

export function buildContentPlanningUserPrompt(
  params: ContentPlanningPromptParams,
): string {
  const exampleChunkId = params.chunkIdList[0] || "chunk-id-1";
  const availableChunkIds = JSON.stringify(params.chunkIdList);

  return getContentPlanningTemplate()
    .replaceAll("{{documentTitle}}", params.docName)
    .replaceAll("{{targetTopicCount}}", String(params.targetTopicCount))
    .replaceAll("{{minTopics}}", String(params.minTopics))
    .replaceAll("{{maxTopics}}", String(params.maxTopics))
    .replaceAll("{{minCardsPerTopic}}", String(params.minCardsPerTopic))
    .replaceAll("{{minQuestionsPerTopic}}", String(params.minQuestionsPerTopic))
    .replaceAll("{{availableChunkIds}}", availableChunkIds)
    .replaceAll("{{chunkContext}}", params.chunkContext)
    .replaceAll("{{chunkId}}", exampleChunkId);
}

// ---------------------------------------------------------------------------
// 2. Educational Lesson Generation (Per-Session)
// ---------------------------------------------------------------------------

export const LESSON_GENERATION_SYSTEM_PROMPT =
  "You produce structured JSON educational lesson content.";

export interface LessonGenerationPromptParams {
  documentTitle: string;
  sessionBlueprint: string;
  chunkContext: string;
  chunkIdList: string[];
}

export function buildLessonGenerationUserPrompt(
  params: LessonGenerationPromptParams,
): string {
  return [
    `You are AVANA’s Expert Educational AI Content Engine.`,
    ``,
    `TASK: COMPLETE LESSON GENERATION FOR ONE EDUCATIONAL SESSION.`,
    ``,
    `DOCUMENT: “${params.documentTitle}”`,
    ``,
    `This request is responsible for EXACTLY ONE session.`,
    ``,
    `Do NOT generate content for any other session.`,
    ``,
    `⸻`,
    ``,
    `1. PRIMARY OBJECTIVE`,
    ``,
    `Generate a complete, deep, accurate, and highly teachable lesson for the provided session blueprint.`,
    ``,
    `Transform the provided source material into a coherent educational lesson for a pharmacy student.`,
    ``,
    `Do NOT merely summarize the source chunks.`,
    ``,
    `Teach the material in a logical educational sequence so that the student can understand:`,
    ``,
    `* what the concept is,`,
    `* how it works,`,
    `* why it matters,`,
    `* how concepts relate to each other,`,
    `* important distinctions,`,
    `* clinical significance,`,
    `* and high-yield points.`,
    ``,
    `The lesson should be sufficiently detailed to provide complete coverage of the assigned session.`,
    ``,
    `Do NOT artificially shorten the lesson to reduce output length.`,
    ``,
    `⸻`,
    ``,
    `2. SINGLE-SESSION RULE — CRITICAL`,
    ``,
    `Generate ONLY the session represented by SESSION BLUEPRINT.`,
    ``,
    `The model must NOT:`,
    ``,
    `* generate multiple sessions,`,
    `* combine multiple sessions,`,
    `* create content for another session,`,
    `* summarize future sessions,`,
    `* or leave major parts of this session for another generation request.`,
    ``,
    `Every generation request is independent.`,
    ``,
    `The lesson must be complete for this session.`,
    ``,
    `⸻`,
    ``,
    `3. SESSION BLUEPRINT IS THE EDUCATIONAL SCOPE`,
    ``,
    `Use the provided session blueprint as the primary definition of what this lesson must teach.`,
    ``,
    `You MUST cover:`,
    ``,
    `* the session title,`,
    `* the session description,`,
    `* every meaningful coreConcept,`,
    `* and every relevant source chunk assigned to this session.`,
    ``,
    `The blueprint defines the scope of the lesson.`,
    ``,
    `Do not introduce unrelated subjects simply because they appear somewhere in the document.`,
    ``,
    `⸻`,
    ``,
    `4. COMPLETE SOURCE COVERAGE`,
    ``,
    `Carefully analyze ALL provided source chunks before writing.`,
    ``,
    `For each relevant source chunk:`,
    ``,
    `1. Identify all educationally meaningful information.`,
    `2. Determine which information belongs to this session.`,
    `3. Integrate that information into the lesson.`,
    `4. Preserve important details, exceptions, distinctions, and relationships.`,
    `5. Do not silently omit substantial information.`,
    ``,
    `Multiple chunks may describe different parts of the same concept.`,
    ``,
    `Synthesize them into a coherent explanation instead of treating each chunk as a separate mini-lesson.`,
    ``,
    `IMPORTANT:`,
    ``,
    `Do not assume that because a chunk is short, its information is unimportant.`,
    ``,
    `Do not summarize the chunks merely to save tokens.`,
    ``,
    `The objective is:`,
    ``,
    `COMPLETE SOURCE COVERAGE → COMPLETE SESSION UNDERSTANDING`,
    ``,
    `⸻`,
    ``,
    `5. EDUCATIONAL REORGANIZATION`,
    ``,
    `The order of the source material does NOT have to determine the order of the lesson.`,
    ``,
    `You may reorganize concepts when doing so improves learning.`,
    ``,
    `For example:`,
    ``,
    `* introduce a prerequisite before a complex mechanism,`,
    `* explain a general mechanism before individual drugs,`,
    `* group related drugs or concepts,`,
    `* compare similar concepts side-by-side,`,
    `* explain cause → mechanism → effect → clinical consequence,`,
    `* revisit an earlier concept briefly when it is necessary to understand a later one.`,
    ``,
    `Educational coherence is more important than preserving PDF order.`,
    ``,
    `⸻`,
    ``,
    `6. EXPERT EDUCATIONAL FREEDOM`,
    ``,
    `You are an expert educational AI.`,
    ``,
    `Do not behave like a summarization engine.`,
    ``,
    `When useful, proactively add educational material such as:`,
    ``,
    `* clarifying explanations,`,
    `* intuitive explanations,`,
    `* examples,`,
    `* comparisons,`,
    `* analogies,`,
    `* clinical scenarios,`,
    `* common misconceptions,`,
    `* common student mistakes,`,
    `* memory aids,`,
    `* connections between concepts,`,
    `* explanations of WHY a fact is important,`,
    `* explanations of relationships that are implicit rather than explicitly explained in the source.`,
    ``,
    `Do not be afraid of increasing the lesson length when additional explanation improves understanding.`,
    ``,
    `A clear, sufficiently detailed lesson is preferable to a short but incomplete lesson.`,
    ``,
    `⸻`,
    ``,
    `7. SUPPLEMENTARY EDUCATIONAL CONTENT`,
    ``,
    `You MAY provide scientifically accurate supplementary explanations that are not explicitly stated in the source when they materially improve understanding.`,
    ``,
    `However, supplementary information must be clearly distinguishable from source-derived material.`,
    ``,
    `Use clean semantic Markdown callouts (STRICTLY WITHOUT ANY EMOJIS OR STICKERS) such as:`,
    ``,
    `> **توضیح تکمیلی:** متن توضیح تکمیلی...`,
    ``,
    `> **برای فهم بهتر:** متن تشریح مفهوم...`,
    ``,
    `> **اشتباه رایج:** این مورد را با … اشتباه نگیرید؛ تفاوت اصلی در … است.`,
    ``,
    `> **نکته آموزشی:** متن نکته آموزشی...`,
    ``,
    `> **هشدار:** متن هشدار یا احتیاط...`,
    ``,
    `> **نکته بالینی:** متن نکته بالینی یا کاربرد درمانی...`,
    ``,
    `> **منع مصرف:** موارد منع مصرف مطلق یا نسبی...`,
    ``,
    `> **نکته کلیدی:** نکته محوری یا تست‌خیز...`,
    ``,
    `Supplementary content must:`,
    ``,
    `* be scientifically accurate,`,
    `* be directly relevant to the current concept,`,
    `* improve understanding,`,
    `* not contradict the source,`,
    `* and not replace source-derived information.`,
    ``,
    `Do not present supplementary information as if it were directly stated in the source.`,
    ``,
    `Do not add unrelated medical information merely to make the lesson longer.`,
    ``,
    `⸻`,
    ``,
    `8. PROACTIVE CONFUSION PREVENTION`,
    ``,
    `Think like an expert teacher.`,
    ``,
    `Whenever two concepts, drugs, mechanisms, adverse effects, indications, classifications, or other facts could reasonably be confused by a student, proactively explain the distinction.`,
    ``,
    `For example (formatted strictly as a semantic callout without emojis):`,
    ``,
    `> **اشتباه رایج:**`,
    `> این مورد را با … اشتباه نگیرید؛ تفاوت اصلی این دو در … است.`,
    ``,
    `Do not wait for the student to ask.`,
    ``,
    `If a concept naturally creates a likely misconception, address it immediately where it appears in the lesson.`,
    ``,
    `⸻`,
    ``,
    `9. DEPTH AND COMPLETENESS`,
    ``,
    `The depth of explanation should depend on the importance and complexity of each concept.`,
    ``,
    `Do NOT give every concept the same amount of text.`,
    ``,
    `Complex, clinically important, or easily confused concepts should receive deeper explanations.`,
    ``,
    `For applicable pharmacology concepts, cover relevant dimensions such as:`,
    ``,
    `* definition,`,
    `* classification,`,
    `* mechanism of action,`,
    `* molecular target/receptor,`,
    `* pharmacodynamic effects,`,
    `* physiological effects,`,
    `* therapeutic indications,`,
    `* adverse effects,`,
    `* contraindications,`,
    `* interactions,`,
    `* pharmacokinetics,`,
    `* toxicity,`,
    `* antidotes,`,
    `* clinical considerations,`,
    `* important comparisons.`,
    ``,
    `Only include dimensions that genuinely apply.`,
    ``,
    `Do not create empty sections merely to satisfy a checklist.`,
    ``,
    `⸻`,
    ``,
    `10. CLINICAL AND EXAM-RELEVANT TEACHING`,
    ``,
    `When supported by the source or appropriate supplementary explanation, emphasize:`,
    ``,
    `* clinically important distinctions,`,
    `* safety-critical information,`,
    `* high-risk adverse effects,`,
    `* contraindications,`,
    `* important interactions,`,
    `* clinically relevant drug selection considerations,`,
    `* high-yield examination facts,`,
    `* common conceptual traps.`,
    ``,
    `However, this stage is for TEACHING.`,
    ``,
    `Do NOT generate quiz questions or flashcards.`,
    ``,
    `⸻`,
    ``,
    `11. COMPARISONS`,
    ``,
    `When two or more related concepts, drugs, drug classes, mechanisms, adverse effects, or clinical situations are meaningfully comparable, provide a useful comparison.`,
    ``,
    `Use a GitHub-Flavored Markdown table when it materially improves understanding.`,
    ``,
    `The table must contain meaningful educational information.`,
    ``,
    `Do not create a table merely to satisfy a formatting requirement.`,
    ``,
    `⸻`,
    ``,
    `12. LANGUAGE`,
    ``,
    `Generate the entire lesson in fluent, natural, high-standard academic Persian.`,
    ``,
    `For important medical/scientific terminology:`,
    ``,
    `* use the standard Persian terminology,`,
    `* include the standard English term in parentheses when useful.`,
    ``,
    `Example:`,
    ``,
    `مهارکننده‌های آنزیم مبدل آنژیوتانسین (ACE Inhibitors)`,
    ``,
    `Do not unnecessarily write complete sentences in English.`,
    ``,
    `⸻`,
    ``,
    `13. SOURCE FIDELITY AND SCIENTIFIC ACCURACY`,
    ``,
    `The provided source chunks are the primary scientific foundation of the lesson.`,
    ``,
    `Never intentionally contradict the source.`,
    ``,
    `Do not fabricate:`,
    ``,
    `* drug properties,`,
    `* mechanisms,`,
    `* dosages,`,
    `* contraindications,`,
    `* interactions,`,
    `* pharmacokinetic values,`,
    `* clinical recommendations,`,
    `* numerical values,`,
    `* or references.`,
    ``,
    `If the source is ambiguous or incomplete, do not invent a confident answer.`,
    ``,
    `If a supplementary explanation is used, it must be scientifically accurate and clearly labeled as supplementary educational content.`,
    ``,
    `⸻`,
    ``,
    `14. AVOID REPETITION WITHOUT LOSING COVERAGE`,
    ``,
    `Do not repeat the same explanation unnecessarily.`,
    ``,
    `However, repetition is acceptable when a brief reminder is pedagogically useful for connecting concepts.`,
    ``,
    `Prefer:`,
    ``,
    `* concise reminders,`,
    `* cross-connections,`,
    `* comparisons,`,
    `* and progressive explanation`,
    ``,
    `over copying the same paragraph multiple times.`,
    ``,
    `⸻`,
    ``,
    `15. OUTPUT FORMAT`,
    ``,
    `Return ONLY valid JSON matching the existing Stage 2 session schema:`,
    ``,
    JSON.stringify(
      {
        kind: "session",
        title: "عنوان جلسه",
        contentMarkdown: "محتوای کامل درسنامه به زبان فارسی و Markdown",
        citationChunkIds: params.chunkIdList.slice(0, 2),
      },
      null,
      2,
    ),
    ``,
    `contentMarkdown must contain the complete educational lesson.`,
    ``,
    `citationChunkIds must contain only valid chunk IDs from the provided session source chunks.`,
    ``,
    `Do not return:`,
    ``,
    `* multiple sessions,`,
    `* flashcards,`,
    `* quizzes,`,
    `* recommendations,`,
    `* review summaries,`,
    `* explanations outside the JSON,`,
    `* Markdown code fences around the JSON.`,
    ``,
    `⸻`,
    ``,
    `16. FINAL INTERNAL QUALITY CHECK`,
    ``,
    `Before returning the JSON, internally verify:`,
    ``,
    `* This output contains exactly ONE session.`,
    `* Every core concept in the blueprint is meaningfully covered.`,
    `* All relevant source chunks were carefully considered.`,
    `* No substantial source information relevant to this session was omitted.`,
    `* The lesson is educationally coherent.`,
    `* Important distinctions and likely misconceptions are addressed.`,
    `* Useful supplementary explanations are clearly labeled.`,
    `* The lesson has not been artificially shortened.`,
    `* No unsupported medical claims were introduced.`,
    `* The output is valid JSON.`,
    `* Only valid provided chunk IDs appear in citationChunkIds.`,
    ``,
    `Do not output this checklist.`,
    ``,
    `⸻`,
    ``,
    `SESSION BLUEPRINT:`,
    ``,
    params.sessionBlueprint,
    ``,
    `⸻`,
    ``,
    `RELEVANT SOURCE CHUNKS:`,
    ``,
    params.chunkContext,
    ``,
    `⸻`,
    ``,
    `AVAILABLE CHUNK IDs FOR THIS SESSION:`,
    ``,
    JSON.stringify(params.chunkIdList),
  ].join("\n");
}

export function getLessonGenerationTemplate(): string {
  return [
    `You are AVANA’s Expert Educational AI Content Engine.`,
    ``,
    `TASK: COMPLETE LESSON GENERATION FOR ONE EDUCATIONAL SESSION.`,
    ``,
    `DOCUMENT: “{{documentTitle}}”`,
    ``,
    `This request is responsible for EXACTLY ONE session.`,
    ``,
    `Do NOT generate content for any other session.`,
    ``,
    `⸻`,
    ``,
    `1. PRIMARY OBJECTIVE`,
    ``,
    `Generate a complete, deep, accurate, and highly teachable lesson for the provided session blueprint.`,
    ``,
    `Transform the provided source material into a coherent educational lesson for a pharmacy student.`,
    ``,
    `Do NOT merely summarize the source chunks.`,
    ``,
    `Teach the material in a logical educational sequence so that the student can understand:`,
    ``,
    `* what the concept is,`,
    `* how it works,`,
    `* why it matters,`,
    `* how concepts relate to each other,`,
    `* important distinctions,`,
    `* clinical significance,`,
    `* and high-yield points.`,
    ``,
    `The lesson should be sufficiently detailed to provide complete coverage of the assigned session.`,
    ``,
    `Do NOT artificially shorten the lesson to reduce output length.`,
    ``,
    `⸻`,
    ``,
    `2. SINGLE-SESSION RULE — CRITICAL`,
    ``,
    `Generate ONLY the session represented by SESSION BLUEPRINT.`,
    ``,
    `The model must NOT:`,
    ``,
    `* generate multiple sessions,`,
    `* combine multiple sessions,`,
    `* create content for another session,`,
    `* summarize future sessions,`,
    `* or leave major parts of this session for another generation request.`,
    ``,
    `Every generation request is independent.`,
    ``,
    `The lesson must be complete for this session.`,
    ``,
    `⸻`,
    ``,
    `3. SESSION BLUEPRINT IS THE EDUCATIONAL SCOPE`,
    ``,
    `Use the provided session blueprint as the primary definition of what this lesson must teach.`,
    ``,
    `You MUST cover:`,
    ``,
    `* the session title,`,
    `* the session description,`,
    `* every meaningful coreConcept,`,
    `* and every relevant source chunk assigned to this session.`,
    ``,
    `The blueprint defines the scope of the lesson.`,
    ``,
    `Do not introduce unrelated subjects simply because they appear somewhere in the document.`,
    ``,
    `⸻`,
    ``,
    `4. COMPLETE SOURCE COVERAGE`,
    ``,
    `Carefully analyze ALL provided source chunks before writing.`,
    ``,
    `For each relevant source chunk:`,
    ``,
    `1. Identify all educationally meaningful information.`,
    `2. Determine which information belongs to this session.`,
    `3. Integrate that information into the lesson.`,
    `4. Preserve important details, exceptions, distinctions, and relationships.`,
    `5. Do not silently omit substantial information.`,
    ``,
    `Multiple chunks may describe different parts of the same concept.`,
    ``,
    `Synthesize them into a coherent explanation instead of treating each chunk as a separate mini-lesson.`,
    ``,
    `IMPORTANT:`,
    ``,
    `Do not assume that because a chunk is short, its information is unimportant.`,
    ``,
    `Do not summarize the chunks merely to save tokens.`,
    ``,
    `The objective is:`,
    ``,
    `COMPLETE SOURCE COVERAGE → COMPLETE SESSION UNDERSTANDING`,
    ``,
    `⸻`,
    ``,
    `5. EDUCATIONAL REORGANIZATION`,
    ``,
    `The order of the source material does NOT have to determine the order of the lesson.`,
    ``,
    `You may reorganize concepts when doing so improves learning.`,
    ``,
    `For example:`,
    ``,
    `* introduce a prerequisite before a complex mechanism,`,
    `* explain a general mechanism before individual drugs,`,
    `* group related drugs or concepts,`,
    `* compare similar concepts side-by-side,`,
    `* explain cause → mechanism → effect → clinical consequence,`,
    `* revisit an earlier concept briefly when it is necessary to understand a later one.`,
    ``,
    `Educational coherence is more important than preserving PDF order.`,
    ``,
    `⸻`,
    ``,
    `6. EXPERT EDUCATIONAL FREEDOM`,
    ``,
    `You are an expert educational AI.`,
    ``,
    `Do not behave like a summarization engine.`,
    ``,
    `When useful, proactively add educational material such as:`,
    ``,
    `* clarifying explanations,`,
    `* intuitive explanations,`,
    `* examples,`,
    `* comparisons,`,
    `* analogies,`,
    `* clinical scenarios,`,
    `* common misconceptions,`,
    `* common student mistakes,`,
    `* memory aids,`,
    `* connections between concepts,`,
    `* explanations of WHY a fact is important,`,
    `* explanations of relationships that are implicit rather than explicitly explained in the source.`,
    ``,
    `Do not be afraid of increasing the lesson length when additional explanation improves understanding.`,
    ``,
    `A clear, sufficiently detailed lesson is preferable to a short but incomplete lesson.`,
    ``,
    `⸻`,
    ``,
    `7. SUPPLEMENTARY EDUCATIONAL CONTENT`,
    ``,
    `You MAY provide scientifically accurate supplementary explanations that are not explicitly stated in the source when they materially improve understanding.`,
    ``,
    `However, supplementary information must be clearly distinguishable from source-derived material.`,
    ``,
    `Use clean semantic Markdown callouts (STRICTLY WITHOUT ANY EMOJIS OR STICKERS) such as:`,
    ``,
    `> **توضیح تکمیلی:** متن توضیح تکمیلی...`,
    ``,
    `> **برای فهم بهتر:** متن تشریح مفهوم...`,
    ``,
    `> **اشتباه رایج:** این مورد را با … اشتباه نگیرید؛ تفاوت اصلی در … است.`,
    ``,
    `> **نکته آموزشی:** متن نکته آموزشی...`,
    ``,
    `> **هشدار:** متن هشدار یا احتیاط...`,
    ``,
    `> **نکته بالینی:** متن نکته بالینی یا کاربرد درمانی...`,
    ``,
    `> **منع مصرف:** موارد منع مصرف مطلق یا نسبی...`,
    ``,
    `> **نکته کلیدی:** نکته محوری یا تست‌خیز...`,
    ``,
    `Supplementary content must:`,
    ``,
    `* be scientifically accurate,`,
    `* be directly relevant to the current concept,`,
    `* improve understanding,`,
    `* not contradict the source,`,
    `* and not replace source-derived information.`,
    ``,
    `Do not present supplementary information as if it were directly stated in the source.`,
    ``,
    `Do not add unrelated medical information merely to make the lesson longer.`,
    ``,
    `⸻`,
    ``,
    `8. PROACTIVE CONFUSION PREVENTION`,
    ``,
    `Think like an expert teacher.`,
    ``,
    `Whenever two concepts, drugs, mechanisms, adverse effects, indications, classifications, or other facts could reasonably be confused by a student, proactively explain the distinction.`,
    ``,
    `For example (formatted strictly as a semantic callout without emojis):`,
    ``,
    `> **اشتباه رایج:**`,
    `> این مورد را با … اشتباه نگیرید؛ تفاوت اصلی این دو در … است.`,
    ``,
    `Do not wait for the student to ask.`,
    ``,
    `If a concept naturally creates a likely misconception, address it immediately where it appears in the lesson.`,
    ``,
    `⸻`,
    ``,
    `9. DEPTH AND COMPLETENESS`,
    ``,
    `The depth of explanation should depend on the importance and complexity of each concept.`,
    ``,
    `Do NOT give every concept the same amount of text.`,
    ``,
    `Complex, clinically important, or easily confused concepts should receive deeper explanations.`,
    ``,
    `For applicable pharmacology concepts, cover relevant dimensions such as:`,
    ``,
    `* definition,`,
    `* classification,`,
    `* mechanism of action,`,
    `* molecular target/receptor,`,
    `* pharmacodynamic effects,`,
    `* physiological effects,`,
    `* therapeutic indications,`,
    `* adverse effects,`,
    `* contraindications,`,
    `* interactions,`,
    `* pharmacokinetics,`,
    `* toxicity,`,
    `* antidotes,`,
    `* clinical considerations,`,
    `* important comparisons.`,
    ``,
    `Only include dimensions that genuinely apply.`,
    ``,
    `Do not create empty sections merely to satisfy a checklist.`,
    ``,
    `⸻`,
    ``,
    `10. CLINICAL AND EXAM-RELEVANT TEACHING`,
    ``,
    `When supported by the source or appropriate supplementary explanation, emphasize:`,
    ``,
    `* clinically important distinctions,`,
    `* safety-critical information,`,
    `* high-risk adverse effects,`,
    `* contraindications,`,
    `* important interactions,`,
    `* clinically relevant drug selection considerations,`,
    `* high-yield examination facts,`,
    `* common conceptual traps.`,
    ``,
    `However, this stage is for TEACHING.`,
    ``,
    `Do NOT generate quiz questions or flashcards.`,
    ``,
    `⸻`,
    ``,
    `11. COMPARISONS`,
    ``,
    `When two or more related concepts, drugs, drug classes, mechanisms, adverse effects, or clinical situations are meaningfully comparable, provide a useful comparison.`,
    ``,
    `Use a GitHub-Flavored Markdown table when it materially improves understanding.`,
    ``,
    `The table must contain meaningful educational information.`,
    ``,
    `Do not create a table merely to satisfy a formatting requirement.`,
    ``,
    `⸻`,
    ``,
    `12. LANGUAGE`,
    ``,
    `Generate the entire lesson in fluent, natural, high-standard academic Persian.`,
    ``,
    `For important medical/scientific terminology:`,
    ``,
    `* use the standard Persian terminology,`,
    `* include the standard English term in parentheses when useful.`,
    ``,
    `Example:`,
    ``,
    `مهارکننده‌های آنزیم مبدل آنژیوتانسین (ACE Inhibitors)`,
    ``,
    `Do not unnecessarily write complete sentences in English.`,
    ``,
    `⸻`,
    ``,
    `13. SOURCE FIDELITY AND SCIENTIFIC ACCURACY`,
    ``,
    `The provided source chunks are the primary scientific foundation of the lesson.`,
    ``,
    `Never intentionally contradict the source.`,
    ``,
    `Do not fabricate:`,
    ``,
    `* drug properties,`,
    `* mechanisms,`,
    `* dosages,`,
    `* contraindications,`,
    `* interactions,`,
    `* pharmacokinetic values,`,
    `* clinical recommendations,`,
    `* numerical values,`,
    `* or references.`,
    ``,
    `If the source is ambiguous or incomplete, do not invent a confident answer.`,
    ``,
    `If a supplementary explanation is used, it must be scientifically accurate and clearly labeled as supplementary educational content.`,
    ``,
    `⸻`,
    ``,
    `14. AVOID REPETITION WITHOUT LOSING COVERAGE`,
    ``,
    `Do not repeat the same explanation unnecessarily.`,
    ``,
    `However, repetition is acceptable when a brief reminder is pedagogically useful for connecting concepts.`,
    ``,
    `Prefer:`,
    ``,
    `* concise reminders,`,
    `* cross-connections,`,
    `* comparisons,`,
    `* and progressive explanation`,
    ``,
    `over copying the same paragraph multiple times.`,
    ``,
    `⸻`,
    ``,
    `15. OUTPUT FORMAT`,
    ``,
    `Return ONLY valid JSON matching the existing Stage 2 session schema:`,
    ``,
    JSON.stringify(
      {
        kind: "session",
        title: "{{sessionTitle}}",
        contentMarkdown: "# {{sessionTitle}}\\n\\n## ۱. تعاریف و اصول پایه\\n...\\n\\n## ۲. مکانیسم‌های سلولی و فارماکودینامیک\\n...\\n\\n## ۳. جدول مقایسه‌ای داروها\\n| نام دارو | گیرنده | نیمه‌عمر | کاربرد | عوارض |\\n|---|---|---|---|---|\\n\\n## ۴. نکات بالینی\\n...",
        citationChunkIds: ["{{chunkId}}"],
      },
      null,
      2,
    ),
    ``,
    `contentMarkdown must contain the complete educational lesson.`,
    ``,
    `citationChunkIds must contain only valid chunk IDs from the provided session source chunks.`,
    ``,
    `Do not return:`,
    ``,
    `* multiple sessions,`,
    `* flashcards,`,
    `* quizzes,`,
    `* recommendations,`,
    `* review summaries,`,
    `* explanations outside the JSON,`,
    `* Markdown code fences around the JSON.`,
    ``,
    `⸻`,
    ``,
    `16. FINAL INTERNAL QUALITY CHECK`,
    ``,
    `Before returning the JSON, internally verify:`,
    ``,
    `* This output contains exactly ONE session.`,
    `* Every core concept in the blueprint is meaningfully covered.`,
    `* All relevant source chunks were carefully considered.`,
    `* No substantial source information relevant to this session was omitted.`,
    `* The lesson is educationally coherent.`,
    `* Important distinctions and likely misconceptions are addressed.`,
    `* Useful supplementary explanations are clearly labeled.`,
    `* The lesson has not been artificially shortened.`,
    `* No unsupported medical claims were introduced.`,
    `* The output is valid JSON.`,
    `* Only valid provided chunk IDs appear in citationChunkIds.`,
    ``,
    `Do not output this checklist.`,
    ``,
    `⸻`,
    ``,
    `SESSION BLUEPRINT:`,
    ``,
    `{{sessionBlueprint}}`,
    ``,
    `⸻`,
    ``,
    `RELEVANT SOURCE CHUNKS:`,
    ``,
    `{{chunkContext}}`,
    ``,
    `⸻`,
    ``,
    `AVAILABLE CHUNK IDs FOR THIS SESSION:`,
    ``,
    `{{chunkIdList}}`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// 3. Atomic Flashcard Generation (Single-Session)
// ---------------------------------------------------------------------------

export const FLASHCARD_GENERATION_SYSTEM_PROMPT =
  "You produce structured JSON atomic flashcards.";

export interface FlashcardGenerationPromptParams {
  documentTitle: string;
  sessionBlueprint: string;
  targetFlashcardCount: number;
  lessonContent: string;
  chunkContext: string;
  chunkIdList: string[];
}

export function getFlashcardGenerationTemplate(): string {
  return [
    `You are AVANA's Expert Educational AI Content Engine.`,
    `TASK: GENERATE HIGH-QUALITY ATOMIC FLASHCARDS FOR EXACTLY ONE EDUCATIONAL SESSION.`,
    `DOCUMENT: "{{documentTitle}}"`,
    `This request is responsible for EXACTLY ONE session.`,
    `Do NOT generate flashcards for any other session.`,
    `---`,
    `## 1. PRIMARY OBJECTIVE`,
    `Generate a comprehensive set of high-quality, atomic flashcards that help a pharmacy student retain the most important and most forgettable information from this session.`,
    `The flashcards must achieve TWO goals simultaneously:`,
    `1. COVERAGE:`,
    `   Ensure that all meaningful and important learning points in the session are represented appropriately.`,
    `2. RETENTION:`,
    `   Prioritize information that is:`,
    `   - easy to forget,`,
    `   - important to memorize,`,
    `   - clinically significant,`,
    `   - frequently confused,`,
    `   - detail-heavy,`,
    `   - exception-based,`,
    `   - classification-based,`,
    `   - comparison-based,`,
    `   - mechanism-based,`,
    `   - or highly relevant for exams and clinical reasoning.`,
    `Do NOT convert every sentence of the lesson into a flashcard.`,
    `The goal is not maximum card count.`,
    `The goal is maximum useful retention with complete coverage of important learning points.`,
    `---`,
    `# 2. SINGLE-SESSION RULE — CRITICAL`,
    `Generate flashcards ONLY for the provided SESSION BLUEPRINT.`,
    `Do NOT:`,
    `- generate cards for other sessions,`,
    `- refer to future sessions as if they were part of this session,`,
    `- combine unrelated sessions,`,
    `- create cards from unrelated parts of the document,`,
    `- or leave major concepts of this session for another generation request.`,
    `This is an independent generation request for ONE session.`,
    `---`,
    `# 3. SOURCE HIERARCHY AND GROUNDING`,
    `Use the following information sources in this priority order:`,
    `1. Relevant source chunks`,
    `2. Complete generated lesson for this session`,
    `3. Session blueprint`,
    `4. Scientifically accurate supplementary knowledge only when necessary for clarification`,
    `The source chunks are the primary scientific grounding.`,
    `The generated lesson is the primary educational organization of the material.`,
    `Do NOT rely only on the lesson summary when the original source chunks contain additional relevant details.`,
    `Carefully inspect ALL provided source chunks.`,
    `If an important detail appears in the source chunks but was not emphasized in the lesson, it may still deserve a flashcard.`,
    `Do NOT invent unsupported facts.`,
    `Do NOT create flashcards from information that is unrelated to this session.`,
    `---`,
    `# 4. COMPLETE COVERAGE WITHOUT OVER-CARDING`,
    `Before generating cards, mentally identify the meaningful learning points contained in this session.`,
    `Classify them conceptually into:`,
    `- Core concepts`,
    `- Important factual details`,
    `- High-yield memorization points`,
    `- Easily forgotten details`,
    `- Important distinctions`,
    `- Exceptions`,
    `- Relationships between concepts`,
    `- Clinically important information`,
    `- Exam-relevant information`,
    `Then decide which learning points deserve a flashcard.`,
    `IMPORTANT:`,
    `Coverage does NOT mean creating one card for every sentence.`,
    `A concept should receive a card when knowing that concept independently is useful for recall, understanding, clinical reasoning, or examination.`,
    `Do NOT omit important details merely to keep the card count low.`,
    `Do NOT create multiple cards that test exactly the same knowledge.`,
    `---`,
    `# 5. HIGH-YIELD AND FORGETTABLE INFORMATION`,
    `Prioritize flashcards for information such as:`,
    `- drug classifications,`,
    `- drug-class members,`,
    `- mechanisms of action,`,
    `- receptor or molecular targets,`,
    `- distinctive pharmacological properties,`,
    `- important indications,`,
    `- major adverse effects,`,
    `- serious or characteristic adverse effects,`,
    `- contraindications,`,
    `- important drug interactions,`,
    `- pharmacokinetic facts that must be remembered,`,
    `- antidotes,`,
    `- important dose-independent facts,`,
    `- exceptions,`,
    `- special populations,`,
    `- distinctive clinical uses,`,
    `- drug-of-choice facts when explicitly supported,`,
    `- important comparisons,`,
    `- confusingly similar concepts,`,
    `- numerical or categorical facts worth memorizing,`,
    `- uncommon but clinically important details,`,
    `- facts repeatedly emphasized in the source.`,
    `Pay particular attention to information that students are likely to forget after reading the lesson once.`,
    `---`,
    `# 6. ATOMICITY — GOLDEN RULE`,
    `GOLDEN RULE:`,
    `ONE FLASHCARD = ONE INDEPENDENT LEARNING POINT.`,
    `A student should be able to answer the card using one focused retrieval operation.`,
    `A card is NOT atomic if answering it requires recalling several unrelated facts.`,
    `BAD:`,
    `"What is the mechanism, indication, and most important adverse effect of Drug X?"`,
    `This tests three independent learning points.`,
    `GOOD:`,
    `"What is the mechanism of action of Drug X?"`,
    `GOOD:`,
    `"What is the most important adverse effect of Drug X?"`,
    `GOOD:`,
    `"What is the main indication of Drug X?"`,
    `---`,
    `# 7. ATOMICITY TEST`,
    `Before accepting a card, internally ask:`,
    `"If the student knows one part of this answer but forgets another part, have they partially failed the same card?"`,
    `If YES and the parts represent independently useful knowledge, split the card.`,
    `Also ask:`,
    `"Could this answer naturally be converted into a list of several independently testable facts?"`,
    `If YES, consider splitting it into multiple cards.`,
    `Do NOT split a genuinely inseparable concept merely to increase card count.`,
    `---`,
    `# 8. ANSWER LENGTH`,
    `Flashcards are for active recall, NOT for teaching full lessons.`,
    `Keep answers concise.`,
    `Prefer:`,
    `- one fact,`,
    `- one short phrase,`,
    `- one short sentence,`,
    `- or a compact list when the list itself is the atomic learning point.`,
    `Avoid long explanatory paragraphs.`,
    `As a general guideline:`,
    `- Prefer answers under approximately 30 words.`,
    `- For simple factual cards, prefer under 15 words.`,
    `- A longer answer is acceptable only when the learning point genuinely requires it.`,
    `Do NOT sacrifice correctness merely to meet a word limit.`,
    `If an answer becomes long because it contains multiple independent facts, split the card.`,
    `---`,
    `# 9. QUESTION DESIGN`,
    `Questions must require genuine retrieval.`,
    `Avoid questions that simply repeat the answer.`,
    `BAD:`,
    `"Drug X is a beta blocker. What is the beta blocker?"`,
    `GOOD:`,
    `"Drug X belongs to which pharmacological class?"`,
    `Avoid vague questions.`,
    `BAD:`,
    `"What is important about Drug X?"`,
    `GOOD:`,
    `"Which adverse effect is particularly characteristic of Drug X?"`,
    `Questions should contain enough context to be unambiguous.`,
    `---`,
    `# 10. NO TEST-TAKING CLUES`,
    `Do NOT make the answer obvious from the wording or formatting.`,
    `Avoid:`,
    `- unnecessary hints,`,
    `- repeating the answer in the question,`,
    `- grammatical clues,`,
    `- unusually specific wording that reveals the answer,`,
    `- answer-length differences,`,
    `- artificial emphasis,`,
    `- English equivalents that reveal the answer,`,
    `- parenthetical hints unless genuinely necessary.`,
    `The student should know the answer because they know the material, not because the card gives it away.`,
    `---`,
    `# 11. IMPORTANT DISTINCTIONS`,
    `Whenever the session contains concepts that students could reasonably confuse, create focused cards that test the distinction.`,
    `For example:`,
    `Card A:`,
    `"What distinguishes Drug A from Drug B in mechanism of action?"`,
    `Card B:`,
    `"Which adverse effect is more characteristic of Drug A?"`,
    `Card C:`,
    `"Which clinical situation favors Drug B over Drug A?"`,
    `Do NOT create one giant comparison card containing every difference.`,
    `Split comparisons into atomic retrieval points when the differences are independently useful.`,
    `---`,
    `# 12. COVERAGE OF LISTS AND CLASSIFICATIONS`,
    `When the source contains a classification or list, determine whether each item is independently important.`,
    `For important lists:`,
    `- create cards for the classification itself,`,
    `- create focused cards for important members,`,
    `- and create cards for distinctive characteristics when those characteristics are important.`,
    `Do NOT blindly create one card per list item if the items are trivial or redundant.`,
    `Do NOT compress a large important classification into one enormous answer.`,
    `Example:`,
    `BAD:`,
    `"List all drugs, mechanisms, indications, adverse effects, and contraindications of this class."`,
    `GOOD:`,
    `"What are the major subclasses of this drug class?"`,
    `GOOD:`,
    `"Which drugs belong to the selective subclass?"`,
    `GOOD:`,
    `"What is the defining mechanism of the selective subclass?"`,
    `---`,
    `# 13. CLINICAL REASONING CARDS`,
    `Use application or clinical-reasoning cards when they test an important concept rather than merely recalling a definition.`,
    `A clinical scenario should be:`,
    `- short,`,
    `- relevant,`,
    `- unambiguous,`,
    `- scientifically grounded,`,
    `- and focused on ONE learning point.`,
    `Do NOT create unnecessarily elaborate clinical cases.`,
    `BAD:`,
    `A long clinical vignette requiring five unrelated deductions.`,
    `GOOD:`,
    `"A patient taking Drug X develops symptom Y. Which known adverse effect of Drug X best explains this finding?"`,
    `---`,
    `# 14. CLOZE CARDS`,
    `Cloze cards may be used when they provide a better retrieval format for:`,
    `- classifications,`,
    `- key relationships,`,
    `- memorable factual statements,`,
    `- pathways,`,
    `- mechanisms,`,
    `- or high-yield associations.`,
    `A cloze card must still test ONE atomic learning point.`,
    `Do not use cloze simply for variety.`,
    `---`,
    `# 15. DIFFICULTY DISTRIBUTION`,
    `Aim for approximately:`,
    `- EASY: 30%`,
    `- MEDIUM: 50%`,
    `- HARD: 20%`,
    `### EASY`,
    `Direct recall or recognition of an important fact.`,
    `Examples:`,
    `- classification,`,
    `- definition,`,
    `- major indication,`,
    `- key adverse effect,`,
    `- basic mechanism.`,
    `### MEDIUM`,
    `Requires understanding, differentiation, connection, or application.`,
    `Examples:`,
    `- distinguishing related drugs,`,
    `- connecting mechanism to effect,`,
    `- identifying an important clinical implication,`,
    `- applying a concept to a short scenario.`,
    `### HARD`,
    `Requires strong mastery of the material.`,
    `Hard cards may involve:`,
    `- subtle distinctions,`,
    `- exceptions,`,
    `- integrating two closely related concepts,`,
    `- clinical application,`,
    `- mechanism → consequence reasoning,`,
    `- distinguishing highly similar alternatives.`,
    `IMPORTANT:`,
    `Hard does NOT mean ambiguous, obscure, trick-based, or poorly worded.`,
    `Every card must have one defensible correct answer.`,
    `---`,
    `# 16. CARD TYPE`,
    `Use the card type that best matches the learning point.`,
    `Allowed values:`,
    `- definition`,
    `- mechanism`,
    `- comparison`,
    `- key_fact`,
    `- application`,
    `- clinical_reasoning`,
    `- cloze`,
    `Do not force artificial diversity.`,
    `Choose the type based on the actual educational purpose of the card.`,
    `---`,
    `# 17. SUPPLEMENTARY EDUCATIONAL CONTENT`,
    `You may create a flashcard from scientifically accurate supplementary information only when that information materially improves understanding or retention of the current session.`,
    `However:`,
    `- it must be directly relevant,`,
    `- it must not contradict the source,`,
    `- it must not replace source-supported learning points,`,
    `- and it must not introduce unnecessary outside facts.`,
    `When possible, prioritize source-grounded facts over supplementary facts.`,
    `Do NOT use supplementary knowledge as an excuse to increase card count.`,
    `---`,
    `# 18. DUPLICATION CONTROL`,
    `Do not generate duplicate or near-duplicate cards.`,
    `Two cards are duplicates when they test substantially the same learning point even if their wording differs.`,
    `For example:`,
    `"What is the mechanism of Drug X?"`,
    `and`,
    `"How does Drug X exert its pharmacological effect?"`,
    `should generally NOT both exist.`,
    `Before finalizing the cards, internally compare them and remove redundant cards.`,
    `Also avoid creating the same learning point in multiple card types unless the second card genuinely tests a different retrieval operation.`,
    `---`,
    `# 19. SOURCE COVERAGE PRIORITY`,
    `When deciding between:`,
    `A. another card about an already-covered fact`,
    `and`,
    `B. a card covering an important fact that has not yet been represented,`,
    `prefer B.`,
    `Coverage gaps should be filled before adding additional cards about already-covered concepts.`,
    `---`,
    `# 20. CARD COUNT`,
    `The target card count is determined by:`,
    `SESSION TARGET FLASHCARD COUNT:`,
    `{{targetFlashcardCount}}`,
    `This number is a planning target, NOT a rigid quota.`,
    `You may generate more cards when the session contains substantially more important, independently testable information.`,
    `You may generate fewer cards when generating additional cards would require:`,
    `- repetition,`,
    `- trivial facts,`,
    `- low-value details,`,
    `- artificial splitting,`,
    `- or unsupported information.`,
    `Do NOT manufacture cards merely to reach a number.`,
    `Do NOT under-generate when important learning points remain uncovered.`,
    `QUALITY AND COVERAGE ARE MORE IMPORTANT THAN EXACT CARD COUNT.`,
    `---`,
    `# 21. PHARMACOLOGY-SPECIFIC COVERAGE`,
    `For pharmacology sessions, consider applicable dimensions such as:`,
    `- classification,`,
    `- mechanism of action,`,
    `- receptor/target,`,
    `- pharmacodynamic effects,`,
    `- therapeutic indications,`,
    `- adverse effects,`,
    `- contraindications,`,
    `- interactions,`,
    `- pharmacokinetics,`,
    `- toxicity,`,
    `- antidotes,`,
    `- important distinctions,`,
    `- clinical selection,`,
    `- high-yield facts.`,
    `Do NOT force every dimension into every session.`,
    `Only create cards for dimensions actually present and educationally relevant.`,
    `---`,
    `# 22. CITATIONS`,
    `Each flashcard must be traceable to the provided source material whenever possible.`,
    `Use \`citationChunkIds\` to identify the source chunks supporting the generated cards.`,
    `Only use valid chunk IDs provided in the input.`,
    `Do NOT invent chunk IDs.`,
    `A card may reference multiple chunks when the learning point is synthesized from multiple source chunks.`,
    `---`,
    `# 23. LANGUAGE`,
    `Generate all flashcards in fluent, natural, academic Persian.`,
    `Use standard Persian medical terminology.`,
    `For important scientific terms, include the standard English term in parentheses when useful.`,
    `Do not unnecessarily write full English sentences.`,
    `---`,
    `# 24. SCIENTIFIC ACCURACY`,
    `Never fabricate:`,
    `- drug properties,`,
    `- mechanisms,`,
    `- indications,`,
    `- adverse effects,`,
    `- contraindications,`,
    `- interactions,`,
    `- pharmacokinetic values,`,
    `- dosages,`,
    `- numerical values,`,
    `- clinical recommendations,`,
    `- or references.`,
    `If the source is ambiguous, do not invent a confident answer.`,
    `If supplementary information is used, it must be scientifically accurate.`,
    `---`,
    `# 25. OUTPUT FORMAT`,
    `Return ONLY valid JSON.`,
    `Use this structure:`,
    JSON.stringify(
      {
        kind: "flashcards",
        cards: [
          {
            question: "سؤال",
            answer: "پاسخ کوتاه و دقیق",
            explanation: "توضیح کوتاه در صورت نیاز",
            cardType: "mechanism",
            difficulty: "medium",
            citationChunkIds: ["chunk-1"],
          },
        ],
      },
      null,
      2,
    ),
    `Rules:`,
    `- Generate cards ONLY for this session.`,
    `- Do not include \`sessionIndex\` unless the existing application schema explicitly requires it.`,
    `- \`question\` must represent one atomic retrieval task.`,
    `- \`answer\` must be concise.`,
    `- \`explanation\` is optional and should not become a second lesson.`,
    `- \`cardType\` must be one of the allowed values.`,
    `- \`difficulty\` must be one of: easy, medium, hard.`,
    `- \`citationChunkIds\` must contain only valid provided chunk IDs.`,
    `- Do not return Markdown code fences.`,
    `- Do not return explanations outside the JSON.`,
    `---`,
    `# 26. FINAL QUALITY CONTROL`,
    `Before returning the JSON, internally verify:`,
    `### Coverage`,
    `- Have all important learning points of the session been considered?`,
    `- Are important forgettable details represented?`,
    `- Are important distinctions represented?`,
    `- Are clinically important and exam-relevant facts covered?`,
    `### Atomicity`,
    `- Does each card test ONE independently useful learning point?`,
    `- Are multi-part questions split when appropriate?`,
    `- Are answers concise?`,
    `### Quality`,
    `- Are the questions unambiguous?`,
    `- Does each card require genuine recall?`,
    `- Are there no test-taking clues?`,
    `- Are there no duplicate or near-duplicate cards?`,
    `### Difficulty`,
    `- Is the approximate 30/50/20 distribution respected?`,
    `- Are hard cards genuinely mastery-based rather than ambiguous?`,
    `### Grounding`,
    `- Are the cards supported by the provided source material?`,
    `- Were relevant source chunks actually considered?`,
    `- Were no unsupported medical claims introduced?`,
    `### Output`,
    `- Is the JSON valid?`,
    `- Are all chunk IDs valid?`,
    `- Are all cards limited to this session?`,
    `Do not output this checklist.`,
    `---`,
    `SESSION BLUEPRINT:`,
    `{{sessionBlueprint}}`,
    `---`,
    `TARGET FLASHCARD COUNT:`,
    `{{targetFlashcardCount}}`,
    `---`,
    `COMPLETE GENERATED LESSON:`,
    `{{lessonContent}}`,
    `---`,
    `RELEVANT SOURCE CHUNKS:`,
    `{{chunkContext}}`,
    `---`,
    `AVAILABLE CHUNK IDs:`,
    `{{chunkIdList}}`,
  ].join("\n");
}

export function buildFlashcardGenerationUserPrompt(
  params: FlashcardGenerationPromptParams,
): string {
  return getFlashcardGenerationTemplate()
    .replaceAll("{{documentTitle}}", params.documentTitle)
    .replaceAll("{{sessionBlueprint}}", params.sessionBlueprint)
    .replaceAll("{{targetFlashcardCount}}", String(params.targetFlashcardCount))
    .replaceAll("{{lessonContent}}", params.lessonContent)
    .replaceAll("{{chunkContext}}", params.chunkContext)
    .replaceAll("{{chunkIdList}}", JSON.stringify(params.chunkIdList));
}

// ---------------------------------------------------------------------------
// 4. Single-Session Multiple-Choice Quiz Generation
// ---------------------------------------------------------------------------

export const QUIZ_GENERATION_SYSTEM_PROMPT =
  "You produce structured JSON multiple-choice quiz questions.";

export interface QuizGenerationPromptParams {
  documentTitle: string;
  sessionBlueprint: string;
  targetQuizCount: number;
  lessonContent: string;
  chunkContext: string;
  chunkIdList: string[];
}

export function buildQuizGenerationUserPrompt(
  params: QuizGenerationPromptParams,
): string {
  const contextSection = params.chunkContext
    ? `\nRELEVANT SOURCE CHUNKS FOR THIS SESSION (Ground truth):\n${params.chunkContext}\n`
    : "";

  return [
    `You are AVANA's Expert Educational AI Content Engine.`,
    `TASK: GENERATE HIGH-QUALITY MULTIPLE-CHOICE QUESTIONS FOR EXACTLY ONE EDUCATIONAL SESSION.`,
    `DOCUMENT: "${params.documentTitle}".`,
    `This request is responsible for EXACTLY ONE session. Do NOT generate questions for any other session.`,
    ``,
    LANGUAGE_REQUIREMENT_PROMPT,
    ``,
    `QUIZ & DISTRACTOR ENGINEERING REQUIREMENTS (docs/AI_LEARNING_POLICY.md & High Discrimination Policy):`,
    `- SESSION TARGET COUNT: Generate at least ${params.targetQuizCount} high-discrimination multiple-choice questions for this session.`,
    `- ONE QUESTION = ONE PRIMARY LEARNING POINT: Each question must test exactly one focused learning point, fact, mechanism, clinical choice, or distinction. Avoid omnibus questions that merge unrelated concepts.`,
    `- SOURCE GROUNDING: Ground each question, correct choice, distractors, and explanation in factual details from the provided SOURCE CHUNKS and the full session lesson.`,
    `- COGNITIVE DEPTH & CATEGORIES: Assign a realistic "category" matching the learning point:`,
    `  * mechanism_discrimination: Differentiating closely related receptor subtypes, enzyme pathways, cellular targets, or biochemical actions.`,
    `  * clinical_reasoning: Selecting preferred pharmacotherapy based on patient presentation, comorbidities, or clinical scenarios.`,
    `  * adverse_effect_differential: Distinguishing characteristic vs rare toxicities between congener drugs or classes.`,
    `  * contraindication_nuance: Identifying true absolute vs relative contraindications.`,
    `  * pharmacokinetic_comparison: Half-life differences, prodrug activation, route of elimination, volume of distribution.`,
    `  * application: High-yield clinical facts, first-line indications, and clinical guidelines.`,
    `  * recall: Core definitions, terminology, and high-yield baseline facts.`,
    `- REAL DIFFICULTY DISTRIBUTION: Aim for an approximate distribution of 30% easy, 50% medium, 20% hard:`,
    `  * "easy": Direct fundamental facts, basic definitions, and standard first-line indications.`,
    `  * "medium": Comparative knowledge, mechanism-to-effect connections, and standard clinical applications.`,
    `  * "hard": Fine discrimination between same-class drugs, subtle contraindications, or multi-factor vignettes. Hardness MUST come from knowledge discrimination and reasoning, NOT confusing wording, ambiguity, or trick phrasing.`,
    `- MANDATORY ANTI-BIAS & ANTI-LEAKAGE RULES (CRITICAL):`,
    `  The correct answer MUST NOT be identifiable by formatting, length, wording richness, parenthetical content, English terminology, abbreviation, or explanatory detail alone.`,
    `  Do not make the correct option more informative, more specific, more explanatory, or more terminology-rich than the distractors. Do not add English equivalents, abbreviations, synonyms, parenthetical explanations, scientific names, or clarifying phrases exclusively to the correct option. Any such formatting or terminology must either be applied consistently across comparable options or omitted when unnecessary.`,
    `  1. Strict Length & Granularity Parity: Correct answer and distractors must be virtually identical in character length, grammatical structure, syntax, and depth. Never make the correct answer conspicuously longer or more detailed than distractors.`,
    `  2. Absolute Prohibition of Inline Explanations: NEVER append explanations, justifications, mechanisms, qualifiers, or phrases like "به دلیل...", "زیرا...", "ناشی از...", "به منظور...", "از طریق..." inside the choice text of the correct answer. Put ALL justifications strictly into the "explanation" field.`,
    `  3. Natural Terminology without Artificial English Padding: Do not artificially append English translations or annotations to distractors solely to pad length. If English terminology is not essential for testing the medical concept, omit it completely from all options (prefer clean, pure Persian terminology). If English terminology, Latin names, or abbreviations (e.g. receptor subtypes, standard drug names) are genuinely needed for accurate scientific identification, use them consistently across all 4 choices or omit them from all choices. NEVER attach an English equivalent only to the correct option.`,
    `  4. Uniform Parentheticals & Synonyms: NEVER use parenthetical clarifications "(...)" or synonyms ("یا ...") exclusively on the correct choice.`,
    `  5. Equal Specificity: If distractors are single entity names (e.g. single drugs), the correct answer must be a single entity name. Distractors and correct answer must operate at the exact same granularity level.`,
    `  6. No Lazy Giveaways: NEVER use "همه موارد", "هیچ‌کدام", "گزینه ۱ و ۲", or placeholder text like "گزینه انحرافی". Every option must be a substantive domain entity or concept.`,
    `  7. Randomize Choice Position: Distribute the correct answer naturally and randomly across all 4 positions (A, B, C, D).`,
    `- CONCISE EDUCATIONAL EXPLANATION: Provide a clear, focused Persian explanation detailing why the correct choice is right and why distractors are wrong. Keep it concise, educational, and avoid repeating the question stem verbatim.`,
    `- QUESTION-LEVEL CITATIONS: Ground every question in the source chunks by attaching "citationChunkIds" containing the specific chunk ID(s) from AVAILABLE CHUNK IDs that support that question.`,
    `- DUPLICATION CONTROL: Internally compare all questions before outputting. Do not generate duplicate or near-duplicate questions.`,
    contextSection,
    `SESSION BLUEPRINT:`,
    params.sessionBlueprint,
    ``,
    `FULL LESSON CONTENT (Educational structure):`,
    params.lessonContent,
    ``,
    `AVAILABLE CHUNK IDs:`,
    JSON.stringify(params.chunkIdList),
    ``,
    `OUTPUT INSTRUCTIONS:`,
    `Return ONLY valid JSON matching this schema:`,
    JSON.stringify({
      kind: "quizzes",
      questions: [
        {
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
          citationChunkIds: params.chunkIdList.slice(0, 1),
        },
      ],
      citationChunkIds: params.chunkIdList,
    }),
  ].join("\n");
}

export function getQuizGenerationTemplate(): string {
  return [
    `You are AVANA's Expert Educational AI Content Engine.`,
    `TASK: GENERATE HIGH-QUALITY MULTIPLE-CHOICE QUESTIONS FOR EXACTLY ONE EDUCATIONAL SESSION.`,
    `DOCUMENT: "{{documentTitle}}".`,
    `This request is responsible for EXACTLY ONE session. Do NOT generate questions for any other session.`,
    ``,
    LANGUAGE_REQUIREMENT_PROMPT,
    ``,
    `QUIZ & DISTRACTOR ENGINEERING REQUIREMENTS (docs/AI_LEARNING_POLICY.md & High Discrimination Policy):`,
    `- SESSION TARGET COUNT: Generate at least {{targetQuizCount}} high-discrimination multiple-choice questions for this session.`,
    `- ONE QUESTION = ONE PRIMARY LEARNING POINT: Each question must test exactly one focused learning point. Avoid omnibus questions.`,
    `- SOURCE GROUNDING: Ground each question, option, and explanation in factual details from the provided SOURCE CHUNKS and the full session lesson.`,
    `- COGNITIVE DEPTH & CATEGORIES: Assign a realistic "category" matching the learning point (mechanism_discrimination, clinical_reasoning, adverse_effect_differential, contraindication_nuance, pharmacokinetic_comparison, application, recall).`,
    `- REAL DIFFICULTY DISTRIBUTION: Target ~30% easy (fundamental facts), ~50% medium (application & comparative), ~20% hard (fine discrimination, subtle contraindications). Hardness MUST come from knowledge discrimination, NOT ambiguity.`,
    `- MANDATORY ANTI-BIAS & ANTI-LEAKAGE RULES (CRITICAL):`,
    `  The correct answer MUST NOT be identifiable by formatting, length, wording richness, parenthetical content, English terminology, abbreviation, or explanatory detail alone.`,
    `  Do not make the correct option more informative, more specific, more explanatory, or more terminology-rich than the distractors. Do not add English equivalents, abbreviations, synonyms, parenthetical explanations, scientific names, or clarifying phrases exclusively to the correct option. Any such formatting or terminology must either be applied consistently across comparable options or omitted when unnecessary.`,
    `  1. Strict Length & Granularity Parity: Correct answer and distractors must be virtually identical in length, grammatical tone, and depth.`,
    `  2. Absolute Prohibition of Inline Explanations: NEVER append explanations, justifications, mechanisms, qualifiers, or phrases like "به دلیل...", "زیرا...", "ناشی از...", "به منظور...", "از طریق..." inside the choice text of the correct answer. Put all explanations in the "explanation" field.`,
    `  3. Natural Terminology without Artificial English Padding: Do not artificially append English translations or annotations to distractors solely to pad length. If English terminology is not essential for testing the medical concept, omit it completely from all options (prefer clean, pure Persian terminology). If English terminology, Latin names, or abbreviations are genuinely needed for accurate scientific identification, use them consistently across all 4 choices or omit them from all choices. NEVER attach an English equivalent only to the correct option.`,
    `  4. Uniform Parentheticals & Synonyms: NEVER use parenthetical clarifications or synonyms exclusively on the correct choice.`,
    `  5. Equal Specificity: Correct answer and distractors must be at the exact same granularity and specificity level.`,
    `  6. No Lazy Giveaways: NEVER use "همه موارد", "هیچ‌کدام", "گزینه ۱ و ۲", or placeholder text.`,
    `  7. Randomize Choice Position: Distribute the correct answer naturally across all 4 positions (A, B, C, D).`,
    `- CONCISE EDUCATIONAL EXPLANATION: Detail why the correct choice is right and why distractors are wrong. Keep concise and educational.`,
    `- QUESTION-LEVEL CITATIONS: Tag each question with "citationChunkIds" containing the specific chunk ID(s) supporting that question.`,
    `- DUPLICATION CONTROL: Avoid duplicate or near-duplicate questions.`,
    ``,
    `RELEVANT SOURCE CHUNKS FOR THIS SESSION:`,
    `{{chunkContext}}`,
    ``,
    `SESSION BLUEPRINT:`,
    `{{sessionBlueprint}}`,
    ``,
    `FULL LESSON CONTENT:`,
    `{{lessonContent}}`,
    ``,
    `AVAILABLE CHUNK IDs:`,
    `{{availableChunkIds}}`,
    ``,
    `OUTPUT INSTRUCTIONS:`,
    `Return ONLY valid JSON matching this schema:`,
    JSON.stringify(
      {
        kind: "quizzes",
        questions: [
          {
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
            citationChunkIds: ["{{chunkId}}"],
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
// 5. Stage 5: High-Density Review Summary Generation («خلاصه مروری»)
// ---------------------------------------------------------------------------

export const REVIEW_SUMMARY_SYSTEM_PROMPT =
  "You produce structured JSON high-density educational review summaries.";

export interface ReviewSummaryPromptParams {
  docName?: string;
  targetReadingMinutes?: number;
  minReadingMinutes?: number;
  maxReadingMinutes?: number;
  chunkContext?: string;
  chunkIdList?: string[];
  structuredInput?: ReviewSummaryGenerationInput;
}

function isReviewSummaryGenerationInput(
  val: unknown,
): val is ReviewSummaryGenerationInput {
  return (
    typeof val === "object" &&
    val !== null &&
    "planning" in val &&
    "lessons" in val &&
    "sourceChunks" in val &&
    "generationContext" in val
  );
}

export function buildReviewSummaryUserPrompt(
  paramsOrInput: ReviewSummaryGenerationInput | ReviewSummaryPromptParams,
): string {
  let input: ReviewSummaryGenerationInput | undefined;
  let legacyParams: ReviewSummaryPromptParams | undefined;

  if (isReviewSummaryGenerationInput(paramsOrInput)) {
    input = paramsOrInput;
  } else if (paramsOrInput.structuredInput) {
    input = paramsOrInput.structuredInput;
  } else {
    legacyParams = paramsOrInput;
  }

  if (input) {
    const rawDocTitle = input.generationContext.documentTitle;
    const cleanTopic = cleanEducationalTitle(rawDocTitle, "مبحث آموزشی جامع");
    const targetMins = input.generationContext.targetMinutes || 12;
    const minMins = input.generationContext.minMinutes || 10;
    const maxMins = input.generationContext.maxMinutes || 15;
    const allChunkIds = input.sourceChunks.map((c) => c.id);
    const exampleChunkId = allChunkIds[0] || "chunk-id-1";

    // Format Stage 1 Planning
    const topicsText =
      input.planning.sourceTopics && input.planning.sourceTopics.length > 0
        ? input.planning.sourceTopics
            .map(
              (t) =>
                `- Topic [${t.id}] "${t.title}": ${t.description || "بدون توضیح"} (Chunks: [${t.chunkIds.join(", ")}])`,
            )
            .join("\n")
        : "None";

    const sessionsText =
      input.planning.sessions && input.planning.sessions.length > 0
        ? input.planning.sessions
            .map(
              (s) =>
                `- Session [${s.id}] (Order: ${s.order}): "${s.title}" — ${s.description || "بدون توضیح"}\n  Core Concept IDs: [${s.coreConceptIds.join(", ")}]\n  Relevant Chunks: [${s.relevantChunkIds.join(", ")}]`,
            )
            .join("\n")
        : "None";

    const conceptsText =
      input.planning.coreConcepts && input.planning.coreConcepts.length > 0
        ? input.planning.coreConcepts
            .map(
              (c) =>
                `- Concept [${c.id}] "${c.title}" (${c.category || "general"}, Importance: ${c.importance || "high"}): ${c.description || "بدون توضیح"}\n  Related Chunks: [${c.relatedChunkIds.join(", ")}]`,
            )
            .join("\n")
        : "None";

    const factsText =
      input.planning.highYieldFacts && input.planning.highYieldFacts.length > 0
        ? input.planning.highYieldFacts
            .map(
              (f) =>
                `- High-Yield Fact [${f.id}] (Session: ${f.sessionId || (f.sessionIndex !== undefined ? f.sessionIndex : "general")}, Importance: ${f.importance || "high"}): "${f.fact}"\n  Source Chunks: [${f.sourceChunkIds.join(", ")}]`,
            )
            .join("\n")
        : "None";

    // Format Stage 2 Lessons
    const lessonsText =
      input.lessons && input.lessons.length > 0
        ? input.lessons
            .map(
              (l) =>
                `### Lesson for Session [${l.sessionId}] (Order ${l.sessionOrder}): "${l.title}"\n${l.contentMarkdown}\nCitations: [${l.citationChunkIds.join(", ")}]`,
            )
            .join("\n\n---\n\n")
        : "None";

    // Format Source Chunks for grounding
    const sourceChunksText =
      input.sourceChunks && input.sourceChunks.length > 0
        ? input.sourceChunks
            .map(
              (c) =>
                `[CHUNK ${c.id}]${c.sectionTitle ? ` (${c.sectionTitle})` : ""}:\n${c.text}`,
            )
            .join("\n\n---\n\n")
        : "None";

    const sampleSummaryTitle = cleanTopic.startsWith("خلاصه")
      ? cleanTopic
      : `خلاصه مروری: ${cleanTopic}`;

    return [
      `You are AVANA's Expert Educational AI Content Engine.`,
      `TASK: GENERATE HIGH-DENSITY REVIEW SUMMARY («خلاصه مروری») for "${cleanTopic}".`,
      ``,
      LANGUAGE_REQUIREMENT_PROMPT,
      ``,
      `STAGE 5 ARCHITECTURAL ROLES:`,
      `- STAGE 1 (CURRICULUM PLANNING): Defines learning structure, topics, sessions, core concepts, and high-yield facts.`,
      `- STAGE 2 (GENERATED EDUCATIONAL LESSONS): Provides pedagogical explanations, clinical distinctions, and confusion-prevention insights.`,
      `- SOURCE CHUNKS: Ground truth for factual accuracy, numbers, dosages, contraindications, and citations.`,
      ``,
      `REVIEW SUMMARY CORE PRINCIPLES & REQUIREMENTS:`,
      `- PURPOSE: Rapid review summary for a student who has ALREADY studied the material and needs to reactivate core knowledge and recall high-yield facts before an exam.`,
      `- ADAPTIVE VOLUME: Designed for a focused ${minMins}–${maxMins} minute review (target: ~${targetMins} minutes). Adapt the volume to the density of the curriculum without artificial truncation.`,
      `- CONSOLIDATED THEMATIC DOMAINS: Group closely related concepts, mechanisms, and exam points into cohesive, comprehensive topic sections rather than fragmented micro-headings.`,
      `- SYNTHESIS OVER MERE COPYING: Synthesize across lessons; do NOT merely reproduce lesson text verbatim. Produce a dense review resource, not a shortened copy of raw documents.`,
      `- NO MERE NAMING: Never summarize a topic merely by naming it. Provide enough substantive factual detail for the student to reconstruct the knowledge.`,
      `- PRESERVE CLINICAL DISTINCTIONS: Preserve clinically important distinctions, contraindications, mechanisms, direct comparisons, and high-yield facts from Stage 1 & Stage 2 supported by source material.`,
      `- STRICT GROUNDING: Ground every statement strictly in the source material. Never hallucinate or invent outside facts (especially doses, adverse effects, contraindications, mechanisms, or numerical values).`,
      `- MANDATORY EDUCATIONAL TITLE REQUIREMENT: The 'title' field MUST be a scholarly, educational Persian title describing the medical/scientific topic (e.g. "${sampleSummaryTitle}"). NEVER use filenames, extensions (.pdf, .docx), or numeric numbers as the title.`,
      ``,
      `==================================================`,
      `STAGE 1: CURRICULUM PLANNING & BLUEPRINT`,
      `==================================================`,
      `[SOURCE TOPICS]`,
      topicsText,
      ``,
      `[PLANNED SESSIONS]`,
      sessionsText,
      ``,
      `[CORE CONCEPTS]`,
      conceptsText,
      ``,
      `[HIGH-YIELD FACTS]`,
      factsText,
      ``,
      `==================================================`,
      `STAGE 2: GENERATED EDUCATIONAL LESSONS`,
      `==================================================`,
      `[LESSONS]`,
      lessonsText,
      ``,
      `==================================================`,
      `SOURCE CHUNKS (FACTUAL GROUND TRUTH & CITATIONS)`,
      `==================================================`,
      sourceChunksText,
      ``,
      `AVAILABLE CHUNK IDs:`,
      JSON.stringify(allChunkIds),
      ``,
      `GENERATION CONSTRAINTS:`,
      `- Target Reading Minutes: ${targetMins} (min: ${minMins}, max: ${maxMins})`,
      input.generationContext.targetWordBudget
        ? `- Target Word Budget: ~${input.generationContext.targetWordBudget} words`
        : "",
      input.generationContext.maxSections
        ? `- Max Recommended Sections: ~${input.generationContext.maxSections}`
        : "",
      `- Audience: ${input.generationContext.audience}`,
      `- Language: Persian (fa)`,
      ``,
      `OUTPUT INSTRUCTIONS:`,
      `Return ONLY valid JSON matching this schema:`,
      JSON.stringify({
        kind: "review_summary",
        title: sampleSummaryTitle,
        estimatedReadingMinutes: targetMins,

        overview:
          "خلاصه فوق‌العاده متمرکز، فشرده و یک‌دقیقه‌ای از هسته اصلی مبحث به زبان فارسی.",
        sections: [
          {
            title: "عنوان بخش موضوعی ۱",
            keyPoints: [
              "نکته کلیدی، فشرده و آموزنده ۱",
              "نکته کلیدی ۲",
            ],
            mechanisms: ["مکانیسم دقیق سلولی یا بیوشیمیایی"],
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
            memorizationPoints: ["اعداد، دوزها، درصدها و موارد حفظی مهم"],
            examPoints: ["نکات پرتکرار و تست‌خیز امتحانی"],
            citationChunkIds: [exampleChunkId],
            relatedSessionIds: ["session-1"],
            relatedConceptIds: ["concept-1"],
          },
        ],
        finalTakeaways: [
          "جمع‌بندی راهبردی و جمع‌بندی نکات طلایی ۱",
          "جمع‌بندی طلایی ۲",
        ],
        citationChunkIds: allChunkIds,
      }),
    ]
      .filter(Boolean)
      .join("\n");
  }

  const docName = legacyParams?.docName || "Document";
  const targetReadingMinutes = legacyParams?.targetReadingMinutes || 12;
  const minReadingMinutes = legacyParams?.minReadingMinutes || 10;
  const maxReadingMinutes = legacyParams?.maxReadingMinutes || 15;
  const chunkContext = legacyParams?.chunkContext || "";
  const chunkIdList = legacyParams?.chunkIdList || [];
  const exampleChunkId = chunkIdList[0] || "chunk-id-1";

  return [
    `You are AVANA's Expert Educational AI Content Engine.`,
    `TASK: GENERATE HIGH-DENSITY REVIEW SUMMARY («خلاصه مروری») for "${docName}".`,
    ``,
    LANGUAGE_REQUIREMENT_PROMPT,
    ``,
    `REVIEW SUMMARY CORE PRINCIPLES & REQUIREMENTS:`,
    `- PURPOSE: This is a RAPID REVIEW SUMMARY for a student who has ALREADY studied the material and needs to reactivate core knowledge and recall high-yield facts before an exam.`,
    `- ADAPTIVE VOLUME: The summary MUST be designed for a focused ${minReadingMinutes}–${maxReadingMinutes} minute review (target: ~${targetReadingMinutes} minutes). Do not artificially truncate the output just to hit a hard limit. Adapt the volume to the density and length of the source chunks. Compact does not mean incomplete. The goal is to produce the shortest summary that still allows the student to accurately reconstruct the important knowledge from the source (compact + comprehensive).`,
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
    chunkContext,
    ``,
    `AVAILABLE CHUNK IDs:`,
    JSON.stringify(chunkIdList),
    ``,
    `OUTPUT INSTRUCTIONS:`,
    `Return ONLY valid JSON matching this schema:`,
    JSON.stringify({
      kind: "review_summary",
      title: docName,
      estimatedReadingMinutes: targetReadingMinutes,
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
      citationChunkIds: chunkIdList,
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
// 6. Lesson AI Study Assistant («از آوانا بپرس» - مود درس)
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
        ? "gemini-3.5-flash-lite"
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
        "targetTopicCount",
        "minTopics",
        "maxTopics",
        "minCardsPerTopic",
        "minQuestionsPerTopic",
        "chunkContext",
        "availableChunkIds",
      ],
      sourceFile: "apps/api/src/modules/generation/generation-service.ts",
      sourceLocation: "GenerationService.extractContentPlan",
      status: "active",
    },
    {
      id: "lesson-generation",
      name: "Single-Session Educational Lesson Generation",
      description:
        "تولید درسنامه عمیق، استاندارد و کامل برای یک جلسه آموزشی مستقل با پوشش کامل مفاهیم و چانک‌های منبع.",
      category: "Lesson Generation",
      provider,
      model,
      systemPrompt: LESSON_GENERATION_SYSTEM_PROMPT,
      userPrompt: getLessonGenerationTemplate(),
      variables: [
        "documentTitle",
        "sessionBlueprint",
        "chunkContext",
        "chunkIdList",
      ],
      sourceFile: "apps/api/src/modules/generation/generation-service.ts",
      sourceLocation: "GenerationService.generateSessionsBatched",
      status: "active",
    },
    {
      id: "flashcard-generation",
      name: "Atomic Flashcards Generation (Single-Session)",
      description:
        "تولید فلش‌کارت‌های اتمیک (<30 کلمه، <5s recall) برای هر جلسه آموزشی بر اساس مفاهیم کلیدی، درس کامل و چانک‌های منبع.",
      category: "Flashcard Generation",
      provider,
      model,
      systemPrompt: FLASHCARD_GENERATION_SYSTEM_PROMPT,
      userPrompt: getFlashcardGenerationTemplate(),
      variables: [
        "documentTitle",
        "sessionBlueprint",
        "targetFlashcardCount",
        "lessonContent",
        "chunkContext",
        "chunkIdList",
      ],
      sourceFile: "apps/api/src/modules/generation/generation-service.ts",
      sourceLocation: "GenerationService.generateFlashcardsSessions",
      status: "active",
    },
    {
      id: "quiz-generation",
      name: "Single-Session Multiple-Choice Quiz Generation",
      description:
        "طراحی آزمون‌های خودسنجی چهارگزینه‌ای مفهومی و بالینی همراه با گزینه‌های انحرافی استاندارد و پاسخ تشریحی جامع به زبان فارسی.",
      category: "Quiz Generation",
      provider,
      model,
      systemPrompt: QUIZ_GENERATION_SYSTEM_PROMPT,
      userPrompt: getQuizGenerationTemplate(),
      variables: [
        "documentTitle",
        "sessionBlueprint",
        "targetQuizCount",
        "lessonContent",
        "chunkContext",
        "availableChunkIds",
      ],
      sourceFile: "apps/api/src/modules/generation/generation-service.ts",
      sourceLocation: "GenerationService.generateQuizzesSessions",
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
        "learningPlan",
        "generatedLessons",
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
