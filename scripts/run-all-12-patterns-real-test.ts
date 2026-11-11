import fs from "fs";
import path from "path";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import {
  STANDARD_QUESTION_PATTERNS,
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

export interface PatternTestResult {
  patternId: string;
  patternTitle: string;
  category: string;
  cognitiveLevel: string;
  skills: string[];
  systemInstructions: string;
  promptSnippet: string;
  instructionsVerifiedInPrompt: boolean;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  rawResponseText: string;
  parsedQuestions: Array<{
    question: string;
    questionType: string;
    choices: string[];
    correctAnswer: string;
    explanation: string;
    difficulty?: string;
    category?: string;
    citationChunkIds?: string[];
  }>;
  validationError?: string;
}

export interface FewShotTestResult {
  patternId: string;
  patternTitle: string;
  variant: "0_examples" | "1_example" | "3_examples";
  latencyMs: number;
  rawResponseText: string;
  parsedQuestions: any[];
}

// In-memory reference examples for Pattern 3 and Pattern 8 (Strictly Lab Environment)
const PATTERN_3_EXAMPLES: QuestionPatternExampleRecord[] = [
  {
    id: "p3-ex-1" as any,
    questionPatternId: "10000000-0000-4000-a000-000000000003" as any,
    sourceQuizQuestionId: null,
    question: "در مقایسه دو رده دارویی آگونیست‌های گیرنده GLP-1 (مانند سماگلوتاید) و مهارکننده‌های DPP-4 (مانند سیتاگلیپتین)، کدام مورد بیانگر تمایز عملکردی محوری این دو رده است؟",
    choices: [
      "آگونیست‌های GLP-1 سطح اینکرتین را ۶ تا ۱۰ برابر افزایش داده و تخلیه معده را به تأخیر می‌اندازند، در حالی که مهارکننده‌های DPP-4 افزایش ۲ تا ۳ برابری ایجاد کرده و تأثیری بر تخلیه معده ندارند.",
      "مهارکننده‌های DPP-4 باعث کاهش وزن معنی‌دار و سرکوب مستقیم گلوکاگون می‌شوند، در حالی که آگونیست‌های GLP-1 بر وزن بیمار کاملاً خنثی هستند.",
      "آگونیست‌های GLP-1 ترشح انسولین را به صورت مستقل از گلوکز تحریک می‌کنند، اما مهارکننده‌های DPP-4 وابسته به گلوکز هستند.",
      "مهارکننده‌های DPP-4 ریسک مرگ قلبی‌عروقی (MACE) را به طور چشمگیر کاهش می‌دهند، در حالی که آگونیست‌های GLP-1 فاقد تاییدیه قلبی هستند.",
    ],
    correctAnswer: "آگونیست‌های GLP-1 سطح اینکرتین را ۶ تا ۱۰ برابر افزایش داده و تخلیه معده را به تأخیر می‌اندازند، در حالی که مهارکننده‌های DPP-4 افزایش ۲ تا ۳ برابری ایجاد کرده و تأثیری بر تخلیه معده ندارند.",
    explanation: "طبق داده‌های فارماکولوژی، آگونیست‌های GLP-1 غلظت دارویی فارماکولوژیک (۶ تا ۱۰ برابر) ایجاد کرده و بر تخلیه معده و سیری اثر مستقیم دارند، در حالی که مهارکننده‌های DPP-4 با مهار تخریب اینکرتین‌های درون‌زاد، غلظت فیزیولوژیک (۲ تا ۳ برابر) ایجاد کرده و اثری بر تخلیه معده ندارند.",
    clinicalContext: "مقایسه فارماکودینامیک و فیزیولوژیک اثر اینکرتین‌ها بر حرکات گوارشی و وزن",
    sortOrder: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "p3-ex-2" as any,
    questionPatternId: "10000000-0000-4000-a000-000000000003" as any,
    sourceQuizQuestionId: null,
    question: "کدام ویژگی فارماکودینامیک، متفورمین را از نظر ریسک بروز هیپوگلیسمی از سولفونیل‌اوره‌ها (مانند گلی‌پیزید) متمایز می‌سازد؟",
    choices: [
      "متفورمین ساخت گلوکز کبدی را مهار کرده و ترشح انسولین را مستقیماً افزایش نمی‌دهد، در حالی که سولفونیل‌اوره‌ها با بستن کانال K-ATP ترشح وابسته و غیروابسته به قند را تحریک می‌کنند.",
      "متفورمین از طریق مسدود کردن بازجذب گلوکز در توبول کلیه عمل می‌کند، در حالی که سولفونیل‌اوره‌ها حساسیت بافت محیطی به انسولین را بهبود می‌بخشند.",
      "متفورمین صرفاً در حضور غلظت بالای گلوکز ترشح انسولین از سلول بتا را القا می‌کند، اما سولفونیل‌اوره‌ها در غلظت پایین گلوکز فعال می‌شوند.",
      "سولفونیل‌اوره‌ها متابولیسم کبدی نداشته و به سرعت دفع می‌شوند، در حالی که متفورمین نیمه‌عمر بسیار طولانی در گردش خون دارد.",
    ],
    correctAnswer: "متفورمین ساخت گلوکز کبدی را مهار کرده و ترشح انسولین را مستقیماً افزایش نمی‌دهد، در حالی که سولفونیل‌اوره‌ها با بستن کانال K-ATP ترشح وابسته و غیروابسته به قند را تحریک می‌کنند.",
    explanation: "متفورمین یک حساس‌کننده به انسولین با مهار گلوکونئوژنز کبدی است و به عنوان مونوتراپی هیپوگلیسمی ایجاد نمی‌کند. برعکس، سولفونیل‌اوره‌ها به گیرنده SUR1 متصل شده و ترشح انسولین را حتی در شرایط افت قند خون ادامه می‌دهند.",
    clinicalContext: "تمایز مکانیسم ترشح انسولین و پتانسیل بروز عارضه هیپوگلیسمی",
    sortOrder: 2,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "p3-ex-3" as any,
    questionPatternId: "10000000-0000-4000-a000-000000000003" as any,
    sourceQuizQuestionId: null,
    question: "در میان مهارکننده‌های آنزیم DPP-4، تمایز فارماکوکینتیک بالینی لیناگلیپتین در مقایسه با ساکساگلیپتین و سیتاگلیپتین در بیماران مبتلا به نارسایی پیشرفته کلیوی چیست؟",
    choices: [
      "دفع لیناگلیپتین عمدتاً از مسیر صفراوی/مدفوعی است و در نارسایی شدید کلیوی نیازی به تعدیل دوز ندارد، در حالی که ساکساگلیپتین و سیتاگلیپتین به تعدیل دوز کلیوی وابسته هستند.",
      "لیناگلیپتین از طریق متابولیسم گسترده CYP3A4 به متابولیت فعال دفع کلیوی تبدیل می‌شود، اما سایر اعضا دفع ناشناخته دارند.",
      "ساکساگلیپتین نیازی به تنظیم دوز کلیوی ندارد زیرا اتصال پروتئینی بالای ۹۹٪ دارد، اما لیناگلیپتین کاملاً از فیلتراسیون گلومرولی پاک می‌شود.",
      "سیتاگلیپتین تنها داروی این رده است که با داروهای مهارکننده CYP3A4 تداخل شدید داشته و باید دوز آن به یک‌چهارم تقلیل یابد.",
    ],
    correctAnswer: "دفع لیناگلیپتین عمدتاً از مسیر صفراوی/مدفوعی است و در نارسایی شدید کلیوی نیازی به تعدیل دوز ندارد، در حالی که ساکساگلیپتین و سیتاگلیپتین به تعدیل دوز کلیوی وابسته هستند.",
    explanation: "لیناگلیپتین دارای دفع غالب غیرکلیوی (مدفوعی/صفراوی) است و در اختلال عملکرد کلیه نیازمند تغییر دوز نیست، بر خلاف سایر داروهای این دسته که کلیرنس کلیوی دارند.",
    clinicalContext: "تمایز مسیر دفع دارویی و تعدیل دوز در آسیب کلیوی بین اعضای یک کلاس دارویی",
    sortOrder: 3,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const PATTERN_8_EXAMPLES: QuestionPatternExampleRecord[] = [
  {
    id: "p8-ex-1" as any,
    questionPatternId: "10000000-0000-4000-a000-000000000008" as any,
    sourceQuizQuestionId: null,
    question: "بیماری با دیابت نوع ۲ طبق پروتکل شروع انسولین سریع‌الاثر، نسبت کربوهیدراتی معادل ۱ واحد انسولین به ازای هر ۱۵ گرم کربوهیدرات (1 unit/15 g) دریافت می‌کند. در صورتی که این بیمار در وعده ناهار ۶۰ گرم کربوهیدرات مصرف کند، دوز بولوس پرندیال مورد نیاز وی چند واحد خواهد بود؟",
    choices: ["۲ واحد", "۴ واحد", "۶ واحد", "۸ واحد"],
    correctAnswer: "۴ واحد",
    explanation: "محاسبه دوز با تقسیم کل کربوهیدرات مصرفی بر ضریب نسبت انجام می‌شود: 60g / 15g = 4 units.",
    clinicalContext: "محاسبه دوز انسولین بولوس با نسبت کربوهیدراتی",
    sortOrder: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "p8-ex-2" as any,
    questionPatternId: "10000000-0000-4000-a000-000000000008" as any,
    sourceQuizQuestionId: null,
    question: "بیماری که تحت درمان با متفورمین ۲۰۰۰ میلی‌گرم در روز است، آزمایش عملکرد کلیوی انجام داده و مقدار eGFR وی ۲۸ میلی‌لیتر در دقیقه به ازای ۱.۷۳ متر مربع گزارش شده است. طبق دستورالعمل رسمی، اقدام بالینی مناسب در خصوص دوز متفورمین کدام است؟",
    choices: [
      "ادامه دوز فعلی متفورمین بدون تغییر همراه با پایش ماهانه",
      "کاهش دوز به ۱۰۰۰ میلی‌گرم در روز و تکرار آزمایش ۳ ماه بعد",
      "قطع کامل مصرف متفورمین به دلیل افت eGFR به زیر آستانه ۳۰ میلی‌لیتر در دقیقه",
      "افزایش دوز به ۲۵۵۰ میلی‌گرم برای جبران افت دفع کلیوی",
    ],
    correctAnswer: "قطع کامل مصرف متفورمین به دلیل افت eGFR به زیر آستانه ۳۰ میلی‌لیتر در دقیقه",
    explanation: "بر اساس دستورالعمل رسمی FDA و ADA، در صورتی که eGFR بیمار به کمتر از ۳۰ میلی‌لیتر در دقیقه/۱.۷۳ متر مربع افت کند، متفورمین به دلیل ریسک بالای اسیدوز لاکتیک شدیداً کنتراندیکه بوده و باید فوراً قطع شود.",
    clinicalContext: "تصمیم‌گیری بالینی بر مبنای مقدار عددی فیلتراسیون گلومرولی eGFR",
    sortOrder: 2,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "p8-ex-3" as any,
    questionPatternId: "10000000-0000-4000-a000-000000000008" as any,
    sourceQuizQuestionId: null,
    question: "بیماری با تشخیص تازه دیابت نوع ۲ و HbA1c اولیه ۹.۰٪ درمان مونوتراپی با متفورمین را با حداکثر دوز آغاز می‌کند. بر اساس میانگین پاسخ درمانی مورد انتظار به مونوتراپی متفورمین (کاهش ۱.۵٪ تا ۲.۰٪)، محدوده HbA1c مورد انتظار بیمار پس از تثبیت درمان کدام است؟",
    choices: ["۸.۲٪ تا ۸.۵٪", "۷.۰٪ تا ۷.۵٪", "۵.۵٪ تا ۶.۰٪", "۶.۲٪ تا ۶.۵٪"],
    correctAnswer: "۷.۰٪ تا ۷.۵٪",
    explanation: "کاهش ۱.۵٪ تا ۲.۰٪ از مقدار پایه ۹.۰٪، محدوده عددی ۷.۰٪ تا ۷.۵٪ را برای HbA1c بیمار حاصل می‌کند (9.0 - 2.0 = 7.0 و 9.0 - 1.5 = 7.5).",
    clinicalContext: "محاسبه هدف کمی درمانی بر مبنای توان کاهش HbA1c",
    sortOrder: 3,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

async function main() {
  console.log("=== Starting AVANA Question Patterns Real-World Test ===");
  console.log("Model: gemini-3.5-flash-lite (Enforced Project Provider)");

  const gateway = new GeminiModelGateway({
    modelName: "gemini-3.5-flash-lite",
  });

  console.log("Fetching ground truth chunks from DB...");
  const rawChunks = await fetchChunks();
  console.log(`Retrieved ${rawChunks.length} chunks.`);

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

  const results: PatternTestResult[] = [];

  // Phase 3: Execute all 12 patterns with 0 examples
  for (let i = 0; i < STANDARD_QUESTION_PATTERNS.length; i++) {
    const seed = STANDARD_QUESTION_PATTERNS[i];
    console.log(`\n--------------------------------------------------`);
    console.log(`Testing Pattern ${i + 1}/12: "${seed.title}" (${seed.id})`);

    const patternDef: QuestionPatternDefinition = {
      id: seed.id,
      title: seed.title,
      description: seed.description,
      category: seed.category,
      cognitiveLevel: seed.cognitiveLevel,
      skills: [...seed.skills],
      systemInstructions: seed.systemInstructions,
      isActive: seed.isActive,
      version: seed.version,
      examples: [], // Test without examples first
    };

    const userPrompt = buildQuizGenerationUserPrompt({
      documentTitle: "فارماکوتراپی دیابت نوع ۲ (Type 2 Diabetes.PDF)",
      sessionBlueprint,
      targetQuizCount: 10,
      lessonContent,
      chunkContext,
      chunkIdList,
      pattern: patternDef,
      patterns: [patternDef],
    });

    // Verification check: Does prompt contain pattern instructions?
    const instructionsVerified = userPrompt.includes(seed.systemInstructions);
    console.log(`Pattern instructions present in prompt: ${instructionsVerified}`);

    const startTime = Date.now();
    let rawResponse = "";
    let parsedQuestions: any[] = [];
    let validationErr: string | undefined;
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      const completion = await gateway.complete({
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

      rawResponse = completion.text;
      inputTokens = completion.usage?.inputTokens || 0;
      outputTokens = completion.usage?.outputTokens || 0;

      const parsed = JSON.parse(rawResponse);
      parsedQuestions = Array.isArray(parsed.questions) ? parsed.questions : [];
      console.log(`Successfully generated ${parsedQuestions.length} questions in ${Date.now() - startTime}ms.`);
    } catch (err: any) {
      console.error(`Generation failed for pattern "${seed.title}":`, err.message);
      validationErr = err.message;
    }

    results.push({
      patternId: seed.id,
      patternTitle: seed.title,
      category: seed.category,
      cognitiveLevel: seed.cognitiveLevel,
      skills: [...seed.skills],
      systemInstructions: seed.systemInstructions,
      promptSnippet: userPrompt.slice(0, 500) + "...",
      instructionsVerifiedInPrompt: instructionsVerified,
      latencyMs: Date.now() - startTime,
      inputTokens,
      outputTokens,
      rawResponseText: rawResponse,
      parsedQuestions,
      validationError: validationErr,
    });

    // Sleep 1.5 seconds between requests to respect rate limits
    await new Promise((r) => setTimeout(r, 1500));
  }

  // Phase 5: Few-Shot Comparison Test for Pattern 3 and Pattern 8
  console.log("\n==================================================");
  console.log("Starting Phase 5: Few-Shot Comparison Test (0 vs 1 vs 3 examples)...");

  const fewShotResults: FewShotTestResult[] = [];

  // Comparison for Pattern 3
  const seedP3 = STANDARD_QUESTION_PATTERNS.find(
    (p) => p.id === "10000000-0000-4000-a000-000000000003",
  )!;

  for (const variant of ["1_example", "3_examples"] as const) {
    console.log(`Testing Pattern 3 with ${variant}...`);
    const examplesToUse =
      variant === "1_example"
        ? [PATTERN_3_EXAMPLES[0]]
        : PATTERN_3_EXAMPLES;

    const patternDef: QuestionPatternDefinition = {
      ...seedP3,
      examples: examplesToUse,
    };

    const userPrompt = buildQuizGenerationUserPrompt({
      documentTitle: "فارماکوتراپی دیابت نوع ۲ (Type 2 Diabetes.PDF)",
      sessionBlueprint,
      targetQuizCount: 10,
      lessonContent,
      chunkContext,
      chunkIdList,
      pattern: patternDef,
      patterns: [patternDef],
    });

    const startTime = Date.now();
    try {
      const completion = await gateway.complete({
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

      const parsed = JSON.parse(completion.text);
      fewShotResults.push({
        patternId: seedP3.id,
        patternTitle: seedP3.title,
        variant,
        latencyMs: Date.now() - startTime,
        rawResponseText: completion.text,
        parsedQuestions: Array.isArray(parsed.questions) ? parsed.questions : [],
      });
      console.log(`Pattern 3 (${variant}) generated ${parsed.questions?.length} questions.`);
    } catch (err: any) {
      console.error(`Pattern 3 (${variant}) failed:`, err.message);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }

  // Comparison for Pattern 8
  const seedP8 = STANDARD_QUESTION_PATTERNS.find(
    (p) => p.id === "10000000-0000-4000-a000-000000000008",
  )!;

  for (const variant of ["1_example", "3_examples"] as const) {
    console.log(`Testing Pattern 8 with ${variant}...`);
    const examplesToUse =
      variant === "1_example"
        ? [PATTERN_8_EXAMPLES[0]]
        : PATTERN_8_EXAMPLES;

    const patternDef: QuestionPatternDefinition = {
      ...seedP8,
      examples: examplesToUse,
    };

    const userPrompt = buildQuizGenerationUserPrompt({
      documentTitle: "فارماکوتراپی دیابت نوع ۲ (Type 2 Diabetes.PDF)",
      sessionBlueprint,
      targetQuizCount: 10,
      lessonContent,
      chunkContext,
      chunkIdList,
      pattern: patternDef,
      patterns: [patternDef],
    });

    const startTime = Date.now();
    try {
      const completion = await gateway.complete({
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

      const parsed = JSON.parse(completion.text);
      fewShotResults.push({
        patternId: seedP8.id,
        patternTitle: seedP8.title,
        variant,
        latencyMs: Date.now() - startTime,
        rawResponseText: completion.text,
        parsedQuestions: Array.isArray(parsed.questions) ? parsed.questions : [],
      });
      console.log(`Pattern 8 (${variant}) generated ${parsed.questions?.length} questions.`);
    } catch (err: any) {
      console.error(`Pattern 8 (${variant}) failed:`, err.message);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }

  // Save raw data to scratch
  const outputData = {
    metadata: {
      timestamp: new Date().toISOString(),
      model: "gemini-3.5-flash-lite",
      documentId: DOCUMENT_ID,
      sourceChunksUsed: TARGET_SEQUENCES,
      totalPatternsTested: results.length,
    },
    patternResults: results,
    fewShotComparisonResults: fewShotResults,
  };

  const outputPath = path.resolve("./scratch/test-results-12-patterns.json");
  fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2), "utf8");
  console.log(`\nSaved all test outputs and raw data to: ${outputPath}`);
  console.log("=== Test Run Completed Successfully ===");
}

main().catch((err) => {
  console.error("Fatal error during test run:", err);
  process.exit(1);
});
