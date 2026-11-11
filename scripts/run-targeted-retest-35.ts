import fs from "fs";
import path from "path";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import {
  validateQuestionQuality,
  validatePatternSemanticCompliance,
  type QuestionPatternDefinition,
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
        try { parsedAnswer = JSON.parse(parsedAnswer); } catch { /* keep */ }
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
  index: number;
  question: string;
  choices: string[];
  correctAnswer: string;
  explanation: string;
  citationChunkIds?: string[];
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

export interface PatternBatchResult {
  patternId: string;
  patternTitle: string;
  version: number;
  requestedCount: number;
  actualCount: number;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  approvedCount: number;
  reviewCount: number;
  errorCount: number;
  approvedRatio: number;
  averageScore: number;
  questions: EvaluatedQuestion[];
}

async function main() {
  console.log("======================================================================");
  console.log("=== AVANA QUESTION PATTERNS: TARGETED RETEST 35 (GEMINI-3.5-FLASH-LITE) ===");
  console.log("======================================================================");

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
۱. داروشناسی بیگوانیدها (متفورمین): مکانیسم مهار گلوکونئوژنز کبدی، فارماکوکینتیک (جذب ۵۰-۶۰٪، دفع ۹۰٪ کلیوی بدون تغییر)، آستانه کلیوی eGFR (منع مصرف قطعی زیر ۳۰، پایش و کاهش دوز زیر ۴۵)، اسیدوز لاکتیک، میزان کاهش HbA1c (۱.۳ تا ۲.۰٪) و FPG (۵۰ تا ۷۰ میلی‌گرم/دسی‌لیتر).
۲. سولفونیل‌اوره‌ها و مگلیتینیدها (گلی‌پیزید، گلی‌بورید، رپاگلینید): اتصال به گیرنده اختصاصی SUR1 و انسداد کانال K-ATP، ترشح گلوکز-مستقل، عارضه شایع هیپوگلیسمی و افزایش وزن، تداخلات دارویی (سیکلوسپورین و ژم‌فیبروزیل با رپاگلینید).
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

  const testConfigs = [
    { id: "10000000-0000-4000-a000-000000000003", title: "تمایز و مقایسه", count: 10 },
    { id: "10000000-0000-4000-a000-000000000006", title: "استدلال چندمرحله‌ای", count: 10 },
    { id: "10000000-0000-4000-a000-000000000008", title: "حل مسئله و محاسبات", count: 10 },
    { id: "10000000-0000-4000-a000-000000000011", title: "تشخیص گزینه نادرست", count: 5 },
  ];

  const results: PatternBatchResult[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let grandTotalApproved = 0;
  let grandTotalReview = 0;
  let grandTotalError = 0;
  let grandTotalQuestions = 0;

  for (const cfg of testConfigs) {
    console.log(`\n----------------------------------------------------------------------`);
    console.log(`Testing Pattern: "${cfg.title}" (${cfg.id}) | Target: ${cfg.count} Questions`);
    console.log(`----------------------------------------------------------------------`);

    const patternDef = await fetchPatternFromDb(cfg.id);
    console.log(`Pattern Version in DB: ${patternDef.version}`);

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

    const inTok = response.usage?.inputTokens || 0;
    const outTok = response.usage?.outputTokens || 0;
    totalInputTokens += inTok;
    totalOutputTokens += outTok;

    console.log(`Received ${parsedQuestions.length} questions in ${latencyMs}ms. Tokens: in=${inTok}, out=${outTok}`);

    const evaluatedQuestions: EvaluatedQuestion[] = [];
    let totalScore = 0;
    let approved = 0;
    let review = 0;
    let error = 0;

    for (let i = 0; i < parsedQuestions.length; i++) {
      const q = parsedQuestions[i];
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
        index: i + 1,
        question: q.question,
        choices: q.choices,
        correctAnswer: typeof q.correctAnswer === "string" ? q.correctAnswer : JSON.stringify(q.correctAnswer),
        explanation: q.explanation,
        citationChunkIds: q.citationChunkIds,
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

      console.log(`  Q${i + 1}: [${status}] (Score ${qSemantic.score}) | Stem: ${q.question?.slice(0, 60)}...`);
      if (qQuality.errors.length > 0) console.log(`     Quality Errors:`, qQuality.errors);
      if (qSemantic.failedChecks.length > 0) console.log(`     Semantic Failed:`, qSemantic.failedChecks);
      if (qQuality.warnings.length > 0) console.log(`     Quality Warnings:`, qQuality.warnings);
      if (qSemantic.warnings.length > 0) console.log(`     Semantic Warnings:`, qSemantic.warnings);
    }

    const batchAvgScore = parsedQuestions.length > 0 ? totalScore / parsedQuestions.length : 0;
    const batchApprovedRatio = parsedQuestions.length > 0 ? (approved / parsedQuestions.length) * 100 : 0;

    grandTotalApproved += approved;
    grandTotalReview += review;
    grandTotalError += error;
    grandTotalQuestions += parsedQuestions.length;

    console.log(`Batch Summary: Approved=${approved}, Review=${review}, Error=${error} (${batchApprovedRatio.toFixed(1)}% Approved, Avg Score ${batchAvgScore.toFixed(1)}%)`);

    results.push({
      patternId: cfg.id,
      patternTitle: cfg.title,
      version: patternDef.version,
      requestedCount: cfg.count,
      actualCount: parsedQuestions.length,
      latencyMs,
      inputTokens: inTok,
      outputTokens: outTok,
      approvedCount: approved,
      reviewCount: review,
      errorCount: error,
      approvedRatio: batchApprovedRatio,
      averageScore: batchAvgScore,
      questions: evaluatedQuestions,
    });
  }

  const grandApprovedRatio = grandTotalQuestions > 0 ? (grandTotalApproved / grandTotalQuestions) * 100 : 0;

  console.log("\n======================================================================");
  console.log("=== FINAL 35-QUESTION RETEST REPORT ===");
  console.log("======================================================================");
  console.log(`Total Generated: ${grandTotalQuestions} / 35`);
  console.log(`Total Approved: ${grandTotalApproved} (${grandApprovedRatio.toFixed(1)}%)`);
  console.log(`Total Needs Review: ${grandTotalReview}`);
  console.log(`Total Error: ${grandTotalError}`);
  console.log(`Total Token Usage: in=${totalInputTokens}, out=${totalOutputTokens}`);

  const outputPayload = {
    executedAt: new Date().toISOString(),
    modelEnforced: "gemini-3.5-flash-lite",
    sourceDocument: {
      id: DOCUMENT_ID,
      title: "Type 2 Diabetes.PDF",
      targetSequences: TARGET_SEQUENCES,
    },
    summary: {
      totalQuestions: grandTotalQuestions,
      approvedCount: grandTotalApproved,
      reviewCount: grandTotalReview,
      errorCount: grandTotalError,
      approvedRatio: grandApprovedRatio,
      totalInputTokens,
      totalOutputTokens,
    },
    patterns: results,
  };

  fs.writeFileSync("scratch/targeted-retest-35-results.json", JSON.stringify(outputPayload, null, 2), "utf-8");
  console.log("Results saved to scratch/targeted-retest-35-results.json.");
}

main().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
