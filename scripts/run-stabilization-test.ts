import fs from "fs";
import path from "path";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import {
  STANDARD_QUESTION_PATTERNS,
  STANDARD_QUESTION_PATTERN_EXAMPLES,
  validateQuestionQuality,
  validatePatternSemanticCompliance,
  type QuestionPatternDefinition,
  type QuestionPatternExampleRecord,
  type QuestionPatternId,
  type UUID,
} from "@avana/domain";
import {
  buildQuizGenerationUserPrompt,
  QUIZ_GENERATION_SYSTEM_PROMPT,
} from "../apps/api/src/modules/generation/prompt-registry.js";
import { GeminiModelGateway } from "../apps/api/src/modules/generation/gateway/gemini.js";

// Load .env
function loadEnv() {
  if (fs.existsSync(".env")) {
    const content = fs.readFileSync(".env", "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx > 0) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnv();

const DOCUMENT_ID = "e56a2e92-9690-4de6-a9f5-bd0bdd99f589"; // Type 2 Diabetes.PDF
const TARGET_SEQUENCES = [22, 23, 24, 25, 26, 31, 48, 49, 50, 52, 54];

interface RawChunk {
  id: string;
  sequence: number;
  content: string;
}

async function fetchChunks(): Promise<RawChunk[]> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL is not set");
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  const res = await client.query(
    `SELECT id, sequence, content FROM document_chunks WHERE document_id = $1 AND sequence = ANY($2::int[]) ORDER BY sequence ASC;`,
    [DOCUMENT_ID, TARGET_SEQUENCES],
  );
  await client.end();
  return res.rows;
}

async function fetchPatternFromDb(patternId: string): Promise<QuestionPatternDefinition> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL is not set");
  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  const patRes = await client.query(
    `SELECT id, title, description, category, cognitive_level, skills, system_instructions, is_active, version, created_at, updated_at, deleted_at FROM question_patterns WHERE id = $1;`,
    [patternId],
  );
  if (patRes.rows.length === 0) {
    await client.end();
    throw new Error(`Pattern ${patternId} not found in DB`);
  }
  const p = patRes.rows[0];

  const exRes = await client.query(
    `SELECT id, question_pattern_id, source_quiz_question_id, question, choices, correct_answer, explanation, clinical_context, sort_order, created_at FROM question_pattern_examples WHERE question_pattern_id = $1 ORDER BY sort_order ASC;`,
    [patternId],
  );
  await client.end();

  return {
    id: p.id,
    title: p.title,
    description: p.description,
    category: p.category,
    cognitiveLevel: p.cognitive_level,
    skills: Array.isArray(p.skills) ? p.skills : JSON.parse(p.skills || "[]"),
    systemInstructions: p.system_instructions,
    isActive: p.is_active,
    version: p.version,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
    deletedAt: p.deleted_at,
    examples: exRes.rows.map((row) => {
      let parsedChoices = row.choices;
      if (typeof parsedChoices === "string") {
        try { parsedChoices = JSON.parse(parsedChoices); } catch { parsedChoices = [parsedChoices]; }
      }
      let parsedAnswer = row.correct_answer;
      if (typeof parsedAnswer === "string") {
        try { parsedAnswer = JSON.parse(parsedAnswer); } catch { /* keep as string */ }
      }
      return {
        id: row.id,
        questionPatternId: row.question_pattern_id,
        sourceQuizQuestionId: row.source_quiz_question_id,
        question: row.question,
        choices: Array.isArray(parsedChoices) ? parsedChoices : [],
        correctAnswer: parsedAnswer,
        explanation: row.explanation,
        clinicalContext: row.clinical_context,
        sortOrder: row.sort_order,
        createdAt: row.created_at,
      };
    }),
  };
}

export interface EvaluatedQuestion {
  question: string;
  choices: string[];
  correctAnswer: string;
  explanation: string;
  qualityValid: boolean;
  qualityErrors: string[];
  qualityWarnings: string[];
  semanticValid: boolean;
  semanticScore: number;
  semanticPassed: string[];
  semanticFailed: string[];
  semanticWarnings: string[];
  explanationKeyAlignment: boolean;
  status: "تأییدشده" | "نیازمند بازبینی" | "دارای خطا";
}

export interface PatternExecutionResult {
  patternId: string;
  patternTitle: string;
  category: string;
  cognitiveLevel: string;
  skills: string[];
  requestedCount: number;
  actualCount: number;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  approvedCount: number;
  reviewCount: number;
  errorCount: number;
  averageScore: number;
  systemInstructions: string;
  questions: EvaluatedQuestion[];
}

export interface FewShotComparisonResult {
  patternId: string;
  patternTitle: string;
  variant: "0_examples" | "1_example" | "3_examples";
  examplesCount: number;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  approvedCount: number;
  averageScore: number;
  questions: EvaluatedQuestion[];
}

async function main() {
  console.log("=== Starting AVANA Question Patterns Stabilization & Verification Live Run ===");
  console.log("Model: gemini-3.5-flash-lite (Enforced Project Provider)");

  const gateway = new GeminiModelGateway({
    modelName: "gemini-3.5-flash-lite",
  });

  console.log("Fetching ground truth chunks from DB...");
  const rawChunks = await fetchChunks();
  console.log(`Retrieved ${rawChunks.length} chunks from Type 2 Diabetes.PDF.`);

  const chunkContext = rawChunks
    .map(
      (c, i) =>
        `[Chunk ID: ${c.id}] (Index ${i + 1}, Seq ${c.sequence}):\n${c.content}`,
    )
    .join("\n\n---\n\n");
  const chunkIdList = rawChunks.map((c) => c.id);

  const lessonContent = `[درسنامه جامع آموزشی فارماکوتراپی دیابت نوع ۲]
مباحث تحت پوشش در این چانک‌ها:
۱. داروشناسی بیگوانیدها (متفورمین): مکانیسم مهار گلوکونئوژنز کبدی، فارماکوکینتیک (جذب ۵۰-۶۰٪، دفع ۹۰٪ کلیوی بدون تغییر)، آستانه کلیوی eGFR (منع مصرف زیر ۳۰، پایش ۳۰-۴۵)، اسیدوز لاکتیک، میزان کاهش HbA1c (۱.۳ تا ۲.۰٪) و FPG (۵۰ تا ۷۰ میلی‌گرم/دسی‌لیتر).
۲. سولفونیل‌اوره‌ها و مگلیتینیدها (گلی‌پیزید، گلی‌بورید، رپاگلینید): اتصال به گیرنده SUR1 و انسداد کانال K-ATP، ترشح گلوکز-مستقل، عارضه شایع هیپوگلیسمی و افزایش وزن، تداخلات دارویی (سیکلوسپورین و ژم‌فیبروزیل با رپاگلینید).
۳. آگونیست‌های گیرنده GLP-1 (سماگلوتاید، لیراگلوتاید، دولاگلوتاید): افزایش ۶ تا ۱۰ برابری سطح اینکرتین، کاهش تخلیه معده، القای سیری و کاهش وزن، منع مصرف قطعی و Black Box Warning در سرطان مدولاری تیروئید (MTC) و سندرم MEN2، تداخل جذبی با داروهای خوراکی نظیر OCP و آنتی‌بیوتیک‌ها (لزوم مصرف با ۱ ساعت فاصله)، کاهش حوادث عمده قلبی-عروقی (MACE).
۴. مهارکننده‌های آنزیم DPP-4 (سیتاگلیپتین، ساکساگلیپتین، لیناگلیپتین): مهار رقابتی آنزیم، افزایش فیزیولوژیک ۲ تا ۳ برابری GLP-1 و GIP، بی‌اثر بر تخلیه معده و وزن (وزن خنثی)، هشدار FDA در مورد نارسایی قلبی با ساکساگلیپتین و آلوگلیپتین، تفاوت فارماکوکینتیک (دفع عمدتاً صفراوی/مدفوعی لیناگلیپتین بدون نیاز به تعدیل دوز در آسیب کلیوی در برابر دفع کلیوی سیتاگلیپتین و ساکساگلیپتین).
۵. محاسبات درمانی: نسبت کربوهیدراتی انسولین (1 unit / 15g carbs)، آستانه فیلتراسیون eGFR، درصد افت قند و هموگلوبین گلیکوزیله.`;

  const sessionBlueprint = JSON.stringify(
    {
      index: 0,
      title: "فارماکوتراپی دیابت نوع ۲",
      description: "بررسی جامع فارماکولوژی، بالین، تداخلات و محاسبات داروهای ضددیابت بر پایه چانک‌های مرجع درسنامه",
      coreConcepts: [
        "Metformin pharmacokinetics, efficacy, eGFR cutoffs & lactic acidosis",
        "Sulfonylureas mechanism (SUR1/K-ATP) and hypoglycemia risk",
        "GLP-1 receptor agonists: MTC/MEN2 black box warning, MACE benefits, gastric emptying",
        "DPP-4 inhibitors: physiological incretin elevation, saxagliptin HF warning, linagliptin biliary clearance",
        "Clinical dosage calculations and glycemic target calculations",
      ],
      relevantChunkIds: chunkIdList,
    },
    null,
    2,
  );

  // Define target runs:
  // 5 improved patterns: 10 questions each (50 questions)
  // 3 control patterns: 3 questions each (9 questions)
  // Total: 59 questions
  const primaryPatternConfigs = [
    { id: "10000000-0000-4000-a000-000000000003", title: "تمایز و مقایسه", count: 10, type: "improved" },
    { id: "10000000-0000-4000-a000-000000000004", title: "نکات دامدار و اشتباهات رایج", count: 10, type: "improved" },
    { id: "10000000-0000-4000-a000-000000000006", title: "استدلال چندمرحله‌ای", count: 10, type: "improved" },
    { id: "10000000-0000-4000-a000-000000000008", title: "حل مسئله و محاسبات", count: 10, type: "improved" },
    { id: "10000000-0000-4000-a000-000000000010", title: "سؤالات ترکیبی", count: 10, type: "improved" },
    // Control patterns
    { id: "10000000-0000-4000-a000-000000000001", title: "نکات پرتکرار امتحانی", count: 3, type: "control" },
    { id: "10000000-0000-4000-a000-000000000005", title: "سناریومحور", count: 3, type: "control" },
    { id: "10000000-0000-4000-a000-000000000011", title: "تشخیص گزینه نادرست", count: 3, type: "control" },
  ];

  const primaryResults: PatternExecutionResult[] = [];

  console.log("\n==================================================");
  console.log("PHASE 1: PRIMARY TEST SUITE (59 QUESTIONS)");
  console.log("==================================================");

  for (const cfg of primaryPatternConfigs) {
    console.log(`\nTesting Pattern: "${cfg.title}" (${cfg.id}) - Target: ${cfg.count} questions...`);
    const patternDef = await fetchPatternFromDb(cfg.id);

    const userPrompt = buildQuizGenerationUserPrompt({
      documentTitle: "فارماکوتراپی دیابت نوع ۲",
      sessionBlueprint,
      targetQuizCount: cfg.count,
      lessonContent,
      chunkContext,
      chunkIdList,
      pattern: patternDef,
    });

    const startT = Date.now();
    const response = await gateway.complete({
      promptVersion: "v1",
      messages: [
        { role: "system", content: QUIZ_GENERATION_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      jsonSchema: { type: "quizzes" },
      correlationId: randomUUID(),
      organizationId: "10000000-0000-4000-a000-000000000000" as any,
      documentId: DOCUMENT_ID as any,
      stage: "quiz",
    });
    const latencyMs = Date.now() - startT;

    let parsedQuestions: any[] = [];
    try {
      const parsed = JSON.parse(response.text);
      parsedQuestions = Array.isArray(parsed.questions)
        ? parsed.questions
        : Array.isArray(parsed)
          ? parsed
          : (parsed.quizzes || []);
    } catch {
      const match = response.text.match(/\[\s*\{[\s\S]*\}\s*\]/);
      if (match) {
        parsedQuestions = JSON.parse(match[0]);
      }
    }

    console.log(`Received ${parsedQuestions.length} questions in ${latencyMs}ms. Tokens: in=${response.usage?.inputTokens || 0}, out=${response.usage?.outputTokens || 0}`);

    const evaluatedQuestions: EvaluatedQuestion[] = [];
    let totalScore = 0;
    let approved = 0;
    let review = 0;
    let error = 0;

    for (const q of parsedQuestions) {
      const qInput = {
        question: q.question,
        choices: q.choices,
        correctAnswer: q.correctAnswer,
        explanation: q.explanation,
      };

      const qQuality = validateQuestionQuality(qInput, { requireFourChoices: true });
      const qSemantic = validatePatternSemanticCompliance(qInput, cfg.id);

      let status: "تأییدشده" | "نیازمند بازبینی" | "دارای خطا" = "تأییدشده";
      if (!qQuality.valid || !qSemantic.valid || qSemantic.score < 60) {
        status = "دارای خطا";
        error++;
      } else if (qSemantic.score < 80 || qQuality.warnings.length > 0 || qSemantic.warnings.length > 0) {
        status = "نیازمند بازبینی";
        review++;
      } else {
        approved++;
      }

      totalScore += qSemantic.score;

      evaluatedQuestions.push({
        question: q.question,
        choices: q.choices,
        correctAnswer: typeof q.correctAnswer === "string" ? q.correctAnswer : JSON.stringify(q.correctAnswer),
        explanation: q.explanation || "",
        qualityValid: qQuality.valid,
        qualityErrors: qQuality.errors,
        qualityWarnings: qQuality.warnings,
        semanticValid: qSemantic.valid,
        semanticScore: qSemantic.score,
        semanticPassed: qSemantic.passedChecks,
        semanticFailed: qSemantic.failedChecks,
        semanticWarnings: qSemantic.warnings,
        explanationKeyAlignment: qSemantic.explanationKeyAlignment,
        status,
      });
    }

    const avgScore = parsedQuestions.length > 0 ? Math.round(totalScore / parsedQuestions.length) : 0;

    primaryResults.push({
      patternId: cfg.id,
      patternTitle: cfg.title,
      category: patternDef.category || "exam",
      cognitiveLevel: patternDef.cognitiveLevel,
      skills: patternDef.skills,
      requestedCount: cfg.count,
      actualCount: parsedQuestions.length,
      latencyMs,
      inputTokens: response.usage?.inputTokens || 0,
      outputTokens: response.usage?.outputTokens || 0,
      approvedCount: approved,
      reviewCount: review,
      errorCount: error,
      averageScore: avgScore,
      systemInstructions: patternDef.systemInstructions,
      questions: evaluatedQuestions,
    });
  }

  console.log("\n==================================================");
  console.log("PHASE 2: FEW-SHOT COMPARISON TEST (0 vs 1 vs 3 EXAMPLES)");
  console.log("==================================================");

  const fewShotPatternIds = [
    { id: "10000000-0000-4000-a000-000000000003", title: "تمایز و مقایسه" },
    { id: "10000000-0000-4000-a000-000000000006", title: "استدلال چندمرحله‌ای" },
    { id: "10000000-0000-4000-a000-000000000008", title: "حل مسئله و محاسبات" },
    { id: "10000000-0000-4000-a000-000000000010", title: "سؤالات ترکیبی" },
  ];

  const fewShotVariants: Array<{ name: "0_examples" | "1_example" | "3_examples"; count: number }> = [
    { name: "0_examples", count: 0 },
    { name: "1_example", count: 1 },
    { name: "3_examples", count: 3 },
  ];

  const fewShotResults: FewShotComparisonResult[] = [];

  for (const pat of fewShotPatternIds) {
    const fullPattern = await fetchPatternFromDb(pat.id);

    for (const v of fewShotVariants) {
      console.log(`Testing Few-shot: "${pat.title}" with ${v.name} (${v.count} examples)...`);
      const slicedPattern: QuestionPatternDefinition = {
        ...fullPattern,
        examples: fullPattern.examples.slice(0, v.count),
      };

      const userPrompt = buildQuizGenerationUserPrompt({
        documentTitle: "فارماکوتراپی دیابت نوع ۲",
        sessionBlueprint,
        targetQuizCount: 2,
        lessonContent,
        chunkContext,
        chunkIdList,
        pattern: slicedPattern,
      });

      const startT = Date.now();
      const response = await gateway.complete({
        promptVersion: "v1",
        messages: [
          { role: "system", content: QUIZ_GENERATION_SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        jsonSchema: { type: "quizzes" },
        correlationId: randomUUID(),
        organizationId: "10000000-0000-4000-a000-000000000000" as any,
        documentId: DOCUMENT_ID as any,
        stage: "quiz",
      });
      const latencyMs = Date.now() - startT;

      let parsedQuestions: any[] = [];
      try {
        const parsed = JSON.parse(response.text);
        parsedQuestions = Array.isArray(parsed.questions)
          ? parsed.questions
          : Array.isArray(parsed)
            ? parsed
            : (parsed.quizzes || []);
      } catch {
        const match = response.text.match(/\[\s*\{[\s\S]*\}\s*\]/);
        if (match) {
          parsedQuestions = JSON.parse(match[0]);
        }
      }

      let totalScore = 0;
      let approved = 0;
      const evaluatedQuestions: EvaluatedQuestion[] = [];

      for (const q of parsedQuestions) {
        const qInput = {
          question: q.question,
          choices: q.choices,
          correctAnswer: q.correctAnswer,
          explanation: q.explanation,
        };
        const qQuality = validateQuestionQuality(qInput, { requireFourChoices: true });
        const qSemantic = validatePatternSemanticCompliance(qInput, pat.id);

        let status: "تأییدشده" | "نیازمند بازبینی" | "دارای خطا" = "تأییدشده";
        if (!qQuality.valid || !qSemantic.valid || qSemantic.score < 60) {
          status = "دارای خطا";
        } else if (qSemantic.score < 80 || qQuality.warnings.length > 0 || qSemantic.warnings.length > 0) {
          status = "نیازمند بازبینی";
        } else {
          approved++;
        }

        totalScore += qSemantic.score;
        evaluatedQuestions.push({
          question: q.question,
          choices: q.choices,
          correctAnswer: typeof q.correctAnswer === "string" ? q.correctAnswer : JSON.stringify(q.correctAnswer),
          explanation: q.explanation || "",
          qualityValid: qQuality.valid,
          qualityErrors: qQuality.errors,
          qualityWarnings: qQuality.warnings,
          semanticValid: qSemantic.valid,
          semanticScore: qSemantic.score,
          semanticPassed: qSemantic.passedChecks,
          semanticFailed: qSemantic.failedChecks,
          semanticWarnings: qSemantic.warnings,
          explanationKeyAlignment: qSemantic.explanationKeyAlignment,
          status,
        });
      }

      const avgScore = parsedQuestions.length > 0 ? Math.round(totalScore / parsedQuestions.length) : 0;

      fewShotResults.push({
        patternId: pat.id,
        patternTitle: pat.title,
        variant: v.name,
        examplesCount: v.count,
        latencyMs,
        inputTokens: response.usage?.inputTokens || 0,
        outputTokens: response.usage?.outputTokens || 0,
        approvedCount: approved,
        averageScore: avgScore,
        questions: evaluatedQuestions,
      });
    }
  }

  const finalPayload = {
    executedAt: new Date().toISOString(),
    model: "gemini-3.5-flash-lite",
    sourceDocument: {
      id: DOCUMENT_ID,
      title: "Type 2 Diabetes.PDF",
      targetSequences: TARGET_SEQUENCES,
    },
    primaryResults,
    fewShotResults,
  };

  const outputPath = path.resolve("scratch/stabilization-test-results.json");
  fs.writeFileSync(outputPath, JSON.stringify(finalPayload, null, 2), "utf8");
  console.log(`\nAll tests completed! Saved raw results to: ${outputPath}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
