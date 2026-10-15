/**
 * Standalone Diagnostic Tool for Planning Stage with GapGPT (deepseek-v4-flash).
 *
 * Accurately reconstructs the production Stage 1 Planning request using
 * real prompt-building functions from `prompt-registry.ts` and GapGPT settings.
 *
 * Security & Fidelity Principles:
 * - Reads API key EXCLUSIVELY from `process.env.GAPGPT_API_KEY`.
 *   Never accepts keys via CLI flags and never prints keys or document content in logs.
 * - Operates without DB mutation, queue, or BullMQ pipeline modifications.
 * - Can fetch real chunks directly from Postgres DB via `--doc-id` or read `--chunks-file`.
 * - Measures latency, HTTP status, finish_reason, token usage, and JSON validity.
 * - Supports optional Streaming mode (--stream) to measure TTFT (Time To First Token)
 *   and diagnose whether generation progresses or stalls.
 *
 * Usage:
 *   # On Server: Live test using real document ID from database:
 *   ./node_modules/.bin/tsx apps/api/scripts/diagnose-planning.ts --doc-id a8ce2923-56eb-4b30-98d5-f31bf1a2335d --stream
 *
 *   # Using real chunks JSON file:
 *   ./node_modules/.bin/tsx apps/api/scripts/diagnose-planning.ts --chunks-file /path/to/real-chunks.json --stream
 *
 *   # Dry run (checks prompt construction & cost without network request):
 *   ./node_modules/.bin/tsx apps/api/scripts/diagnose-planning.ts --chunks-file /path/to/real-chunks.json --dry-run
 */

import { readFileSync, existsSync } from "node:fs";
import { performance } from "node:perf_hooks";
import pg from "pg";
import {
  CONTENT_PLANNING_SYSTEM_PROMPT,
  buildContentPlanningUserPrompt,
} from "../src/modules/generation/prompt-registry.js";
import { cleanAndParseGapGPTJson } from "../src/modules/generation/gateway/gapgpt.js";

interface ChunkInput {
  id: string;
  heading: string | null;
  content: string;
}

function parseCliArgs(): {
  dryRun: boolean;
  stream: boolean;
  docId?: string;
  chunksFile?: string;
  maxTokens?: number;
  docName: string;
  targetTopics: number;
  baseUrl: string;
  model: string;
  timeoutMs: number;
} {
  const args = process.argv.slice(2);
  let dryRun = false;
  let stream = false;
  let docId: string | undefined;
  let chunksFile: string | undefined;
  let maxTokens: number | undefined;
  let docName = "نمونه مبحث داروشناسی بالینی";
  let targetTopics = 9;
  const baseUrl = (process.env.GAPGPT_BASE_URL || "https://api.gapgpt.app/v1").replace(/\/+$/, "");
  const model = process.env.GAPGPT_USER_AI_MODEL || process.env.GAPGPT_MODEL || "deepseek-v4-flash";
  const timeoutMs = Number(process.env.DIAGNOSTIC_TIMEOUT_MS) || 180_000;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--stream") {
      stream = true;
    } else if (arg === "--doc-id" && i + 1 < args.length) {
      docId = args[++i];
    } else if (arg.startsWith("--doc-id=")) {
      docId = arg.slice("--doc-id=".length);
    } else if (arg === "--chunks-file" && i + 1 < args.length) {
      chunksFile = args[++i];
    } else if (arg.startsWith("--chunks-file=")) {
      chunksFile = arg.slice("--chunks-file=".length);
    } else if (arg === "--max-tokens" && i + 1 < args.length) {
      maxTokens = Number(args[++i]);
    } else if (arg.startsWith("--max-tokens=")) {
      maxTokens = Number(arg.slice("--max-tokens=".length));
    } else if (arg === "--doc-name" && i + 1 < args.length) {
      docName = args[++i];
    } else if (arg.startsWith("--doc-name=")) {
      docName = arg.slice("--doc-name=".length);
    } else if (arg === "--target-topics" && i + 1 < args.length) {
      targetTopics = Number(args[++i]);
    } else if (arg.startsWith("--target-topics=")) {
      targetTopics = Number(arg.slice("--target-topics=".length));
    }
  }

  return { dryRun, stream, docId, chunksFile, maxTokens, docName, targetTopics, baseUrl, model, timeoutMs };
}

async function loadRealChunksFromDb(docId: string): Promise<{ chunks: ChunkInput[]; docName?: string }> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error(
      "DATABASE_URL is not set in environment. Cannot fetch real chunks from database without connection string.",
    );
  }

  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();

  try {
    const docRes = await client.query(
      "SELECT id, original_name FROM documents WHERE id = $1 LIMIT 1",
      [docId],
    );
    const docName = docRes.rows[0]?.original_name;

    const chunksRes = await client.query(
      "SELECT id, heading, content FROM document_chunks WHERE document_id = $1 ORDER BY sequence ASC",
      [docId],
    );

    if (chunksRes.rows.length === 0) {
      throw new Error(`No chunks found in database for document ID: ${docId}`);
    }

    const chunks: ChunkInput[] = chunksRes.rows.map((row) => ({
      id: String(row.id),
      heading: row.heading ? String(row.heading) : null,
      content: String(row.content || ""),
    }));

    return { chunks, docName };
  } finally {
    await client.end();
  }
}

function loadRealChunksFromFile(filePath: string): ChunkInput[] {
  if (!existsSync(filePath)) {
    throw new Error(`Chunks file not found at: ${filePath}`);
  }
  const raw = readFileSync(filePath, "utf-8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(`Chunks file must contain a non-empty array of chunks.`);
  }
  return parsed.map((c, idx) => ({
    id: String(c.id || `chunk-${idx + 1}`),
    heading: c.heading ? String(c.heading) : null,
    content: String(c.content || ""),
  }));
}

export async function runPlanningDiagnostic(): Promise<void> {
  const options = parseCliArgs();

  process.stdout.write("============================================================\n");
  process.stdout.write("       AVANA Planning Diagnostic Tool (GapGPT / DeepSeek)   \n");
  process.stdout.write("============================================================\n");

  let chunks: ChunkInput[] = [];
  let resolvedDocName = options.docName;

  if (options.docId) {
    process.stdout.write(`🔍 در حال دریافت چانک‌های واقعی سند ${options.docId} از دیتابیس...\n`);
    const dbResult = await loadRealChunksFromDb(options.docId);
    chunks = dbResult.chunks;
    if (dbResult.docName) resolvedDocName = dbResult.docName;
    process.stdout.write(`✅ ${chunks.length} چانک واقعی از دیتابیس با موفقیت بارگذاری شد.\n`);
  } else if (options.chunksFile) {
    process.stdout.write(`📂 در حال بارگذاری چانک‌ها از فایل: ${options.chunksFile}...\n`);
    chunks = loadRealChunksFromFile(options.chunksFile);
    process.stdout.write(`✅ ${chunks.length} چانک با موفقیت از فایل بارگذاری شد.\n`);
  } else {
    process.stderr.write(
      "❌ خطا: چانک‌های واقعی سند مشخص نشده‌اند.\n\n" +
      "مطابق دستور، استفاده از داده‌های مصنوعی برای آزمایش پرامپت واقعی مجاز نیست.\n" +
      "لطفاً از یکی از دو روش زیر استفاده کنید:\n\n" +
      "  1) اجرای مستقیم روی سرور با استخراج چانک‌ها از دیتابیس:\n" +
      "     ./node_modules/.bin/tsx apps/api/scripts/diagnose-planning.ts --doc-id a8ce2923-56eb-4b30-98d5-f31bf1a2335d --stream\n\n" +
      "  2) اجرای با فایل JSON حاوی چانک‌های واقعی سند:\n" +
      "     ./node_modules/.bin/tsx apps/api/scripts/diagnose-planning.ts --chunks-file /path/to/real-chunks.json --stream\n\n"
    );
    process.exit(1);
  }

  const apiKey = process.env.GAPGPT_API_KEY?.trim();
  const totalCharacters = chunks.reduce((acc, c) => acc + c.content.length, 0);
  const chunkIdList = chunks.map((c) => c.id);
  const chunkContext = chunks
    .map(
      (c, i) =>
        `[Chunk ID: ${c.id}] (Index ${i + 1})${c.heading ? ` - ${c.heading}` : ""}:\n${c.content}`,
    )
    .join("\n\n---\n\n");

  const targetTopicCount = options.targetTopics;
  const minTopics = Math.min(8, targetTopicCount);
  const maxTopics = Math.max(12, targetTopicCount + 2);
  const minCardsPerTopic = 10;
  const minQuestionsPerTopic = 5;

  const userPrompt = buildContentPlanningUserPrompt({
    docName: resolvedDocName,
    targetTopicCount,
    minTopics,
    maxTopics,
    minCardsPerTopic,
    minQuestionsPerTopic,
    chunkCount: chunks.length,
    chunkContext,
    chunkIdList,
  });

  const estimatedInputTokens = Math.round(userPrompt.length * 0.28);
  const estimatedOutputTokens = 3_500;
  const estimatedCostUsd =
    (estimatedInputTokens / 1_000_000) * 0.14 +
    (estimatedOutputTokens / 1_000_000) * 0.28;

  process.stdout.write(`\n📊 مشخصات درخواست آزمایشی:\n`);
  process.stdout.write(`- نام سند: ${resolvedDocName}\n`);
  process.stdout.write(`- تعداد چانک‌های واقعی: ${chunks.length}\n`);
  process.stdout.write(`- مجموع کاراکترهای چانک‌ها: ${totalCharacters.toLocaleString()} کاراکتر\n`);
  process.stdout.write(`- طول پرامپت کاربر (شامل قالب و چانک‌ها): ${userPrompt.length.toLocaleString()} کاراکتر\n`);
  process.stdout.write(`- طول پرامپت سیستم: ${CONTENT_PLANNING_SYSTEM_PROMPT.length} کاراکتر\n`);
  process.stdout.write(`- تخمین توکن ورودی: ~${estimatedInputTokens.toLocaleString()} توکن\n`);
  process.stdout.write(`- تعداد جلسات هدف: ${targetTopicCount}\n`);
  process.stdout.write(`- Provider: gapgpt\n`);
  process.stdout.write(`- Model: ${options.model}\n`);
  process.stdout.write(`- Base URL: ${options.baseUrl}\n`);
  process.stdout.write(`- حالت Streaming: ${options.stream ? "فعال (--stream - سنجش TTFT و جریان توکن)" : "غیرفعال (استاندارد پروداکشن)"}\n`);
  process.stdout.write(`- Max Tokens: ${options.maxTokens ?? "نامشخص (پیش‌فرض پروداکشن)"}\n`);
  process.stdout.write(`- Timeout کلاینت: ${options.timeoutMs}ms (${options.timeoutMs / 1000}s)\n`);
  process.stdout.write(`- منبع کلید API: متغیر محیطی GAPGPT_API_KEY (${apiKey ? "موجود است" : "یافت نشد!"})\n`);
  process.stdout.write(`- تعداد درخواست‌های ارسالی: دقیقاً ۱ درخواست مستقیم\n`);
  process.stdout.write(`- هزینه تقریبی درخواست: ~$${estimatedCostUsd.toFixed(5)} USD\n`);

  if (options.dryRun) {
    process.stdout.write("\nℹ️ حالت Dry-run فعال است. درخواستی به شبکه ارسال نشد.\n");
    return;
  }

  if (!apiKey) {
    process.stderr.write(
      "\n❌ خطا: متغیر محیطی GAPGPT_API_KEY یافت نشد. لطفاً آن را در محیط شل یا فایل .env تنظیم فرمایید.\n",
    );
    process.exit(1);
  }

  const requestBody: Record<string, unknown> = {
    model: options.model,
    messages: [
      { role: "system", content: CONTENT_PLANNING_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.2,
    response_format: { type: "json_object" },
    ...(options.stream ? { stream: true } : {}),
    ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
  };

  const chatUrl = `${options.baseUrl}/chat/completions`;
  process.stdout.write(`\n🚀 در حال ارسال ۱ درخواست مستقیم به ${chatUrl}...\n`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  const startTime = performance.now();

  try {
    const response = await fetch(chatUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Accept": options.stream ? "text/event-stream" : "application/json",
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    if (!response.ok) {
      clearTimeout(timer);
      const errBody = await response.text();
      const elapsedMs = Math.round(performance.now() - startTime);
      process.stderr.write(`\n❌ سرور وضعیت ناموفق بازگرداند (${elapsedMs}ms): HTTP ${response.status} ${response.statusText}\n`);
      process.stderr.write(`پاسخ خطا: ${errBody.slice(0, 500)}\n`);
      process.exit(3);
    }

    if (options.stream && response.body) {
      process.stdout.write("📡 دریافت پاسخ در حالت استریم...\n");
      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let ttftMs: number | null = null;
      let assembledContent = "";
      let chunkCount = 0;
      let streamFinishReason = "unknown";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const now = performance.now();
        if (ttftMs === null) {
          ttftMs = Math.round(now - startTime);
          process.stdout.write(`⚡ اولین توکن دریافت شد (TTFT): ${(ttftMs / 1000).toFixed(2)}s (${ttftMs}ms)\n`);
        }

        chunkCount++;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === "data: [DONE]") continue;
          if (trimmed.startsWith("data: ")) {
            try {
              const data = JSON.parse(trimmed.slice(6));
              const delta = data.choices?.[0]?.delta?.content || "";
              const finish = data.choices?.[0]?.finish_reason;
              if (finish) streamFinishReason = finish;
              assembledContent += delta;
            } catch {
              // Ignore non-JSON heartbeat
            }
          }
        }
      }

      clearTimeout(timer);
      const totalElapsedMs = Math.round(performance.now() - startTime);

      process.stdout.write(`\n📋 نتایج استریم:\n`);
      process.stdout.write(`- Time-to-First-Token (TTFT): ${ttftMs ? `${(ttftMs / 1000).toFixed(2)}s (${ttftMs}ms)` : "هیچ توکنی دریافت نشد"}\n`);
      process.stdout.write(`- زمان کل استریم: ${(totalElapsedMs / 1000).toFixed(2)}s (${totalElapsedMs}ms)\n`);
      process.stdout.write(`- تعداد بسته‌های استریم (Chunks): ${chunkCount}\n`);
      process.stdout.write(`- Finish Reason: ${streamFinishReason}\n`);
      process.stdout.write(`- طول کاراکتری خروجی: ${assembledContent.length.toLocaleString()} کاراکتر\n`);

      validateOutputJson(assembledContent, streamFinishReason);
    } else {
      const responseText = await response.text();
      clearTimeout(timer);
      const elapsedMs = Math.round(performance.now() - startTime);

      process.stdout.write(`\n📋 نتایج دریافت پاسخ:\n`);
      process.stdout.write(`- زمان پاسخ (Latency): ${(elapsedMs / 1000).toFixed(2)} ثانیه (${elapsedMs}ms)\n`);
      process.stdout.write(`- کد وضعیت HTTP: ${response.status} ${response.statusText}\n`);

      let parsedEnvelope: {
        id?: string;
        model?: string;
        choices?: Array<{
          finish_reason?: string;
          message?: { content?: string };
        }>;
        usage?: {
          prompt_tokens?: number;
          completion_tokens?: number;
          total_tokens?: number;
        };
      };

      try {
        parsedEnvelope = JSON.parse(responseText);
      } catch (err) {
        process.stderr.write(`❌ خطای پارس پاسخ به عنوان JSON: ${err instanceof Error ? err.message : String(err)}\n`);
        process.stderr.write(`متن دریافتی (۳۰۰ کاراکتر اول): ${responseText.slice(0, 300)}\n`);
        process.exit(4);
      }

      const choice = parsedEnvelope.choices?.[0];
      const finishReason = choice?.finish_reason || "unknown";
      const usage = parsedEnvelope.usage || {};
      const rawCompletion = choice?.message?.content || "";

      process.stdout.write(`- مدل پاسخ‌دهنده: ${parsedEnvelope.model || options.model}\n`);
      process.stdout.write(`- Finish Reason: ${finishReason}\n`);
      process.stdout.write(`- توکن‌های ورودی (prompt_tokens): ${usage.prompt_tokens ?? "نامشخص"}\n`);
      process.stdout.write(`- توکن‌های خروجی (completion_tokens): ${usage.completion_tokens ?? "نامشخص"}\n`);
      process.stdout.write(`- مجموع توکن‌ها (total_tokens): ${usage.total_tokens ?? "نامشخص"}\n`);
      process.stdout.write(`- طول کاراکتری خروجی: ${rawCompletion.length.toLocaleString()} کاراکتر\n`);

      validateOutputJson(rawCompletion, finishReason);
    }
  } catch (err: unknown) {
    clearTimeout(timer);
    const elapsedMs = Math.round(performance.now() - startTime);
    if (controller.signal.aborted) {
      process.stderr.write(`\n❌ نتیجه: درخواست پس از ${elapsedMs}ms به Timeout (${options.timeoutMs}ms) برخورد کرد!\n`);
    } else {
      process.stderr.write(`\n❌ نتیجه: خطای شبکه پس از ${elapsedMs}ms: ${err instanceof Error ? err.message : String(err)}\n`);
    }
    process.exit(2);
  }

  process.stdout.write("\n============================================================\n");
}

function validateOutputJson(rawCompletion: string, finishReason: string): void {
  process.stdout.write(`\n🔍 اعتبارسنجی JSON خروجی:\n`);
  try {
    const validatedJson = cleanAndParseGapGPTJson<{
      kind?: string;
      moduleTitle?: string;
      sessions?: unknown[];
      sourceTopics?: unknown[];
      highYieldFacts?: unknown[];
    }>(rawCompletion);

    const sessionCount = Array.isArray(validatedJson.sessions) ? validatedJson.sessions.length : 0;
    const topicCount = Array.isArray(validatedJson.sourceTopics) ? validatedJson.sourceTopics.length : 0;
    const factCount = Array.isArray(validatedJson.highYieldFacts) ? validatedJson.highYieldFacts.length : 0;

    process.stdout.write(`✅ ساختار JSON کاملاً معتبر است!\n`);
    process.stdout.write(`- Kind: ${validatedJson.kind || "تعیین نشده"}\n`);
    process.stdout.write(`- عنوان ماژول: ${validatedJson.moduleTitle || "تعیین نشده"}\n`);
    process.stdout.write(`- تعداد جلسات استخراج‌شده: ${sessionCount}\n`);
    process.stdout.write(`- تعداد مباحث منبع (sourceTopics): ${topicCount}\n`);
    process.stdout.write(`- تعداد نکات مهم (highYieldFacts): ${factCount}\n`);
  } catch (jsonErr) {
    process.stderr.write(`❌ خطای اعتبارسنجی JSON خروجی: ${jsonErr instanceof Error ? jsonErr.message : String(jsonErr)}\n`);
    if (finishReason === "length") {
      process.stderr.write(`⚠️ توجه: به دلیل finish_reason="length"، خروجی به سقف توکن برخورد کرده و منقطع شده است.\n`);
    }
  }
}

if (process.argv[1]?.endsWith("diagnose-planning.ts")) {
  runPlanningDiagnostic().catch((err) => {
    process.stderr.write(`خطای غیرمنتظره: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}
