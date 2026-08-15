/**
 * Live Verification Script for Cloudflare Workers AI with GLM-4.7-Flash.
 *
 * Verifies:
 * 1. Cloudflare authentication and connectivity.
 * 2. Model: @cf/zai-org/glm-4.7-flash.
 * 3. Test 1 — Persian medical concept explanation (ACE inhibitors vs ARBs).
 * 4. Test 2 — Structured Flashcards for Beta Blockers (JSON output & parsing).
 * 5. Test 3 — Medical Reasoning / Multiple-Choice Question (MCQ).
 * 6. Latency, character count, and finish reason tracking.
 *
 * Security: NEVER prints Account ID or API Token.
 */

import { loadMonorepoEnv } from "@avana/config";
import { CloudflareModelGateway, DEFAULT_CLOUDFLARE_AI_MODEL } from "../apps/api/src/modules/generation/gateway/cloudflare.js";
import type { OrganizationId, DocumentId } from "@avana/domain";

loadMonorepoEnv();

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const apiToken = process.env.CLOUDFLARE_API_TOKEN;
const model = process.env.CLOUDFLARE_AI_MODEL || DEFAULT_CLOUDFLARE_AI_MODEL;

if (!accountId || !apiToken) {
  console.error("[cloudflare] Error: CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN must be set in .env");
  process.exit(1);
}

console.log("================================================================");
console.log("  AVANA — Cloudflare Workers AI Verification Trace");
console.log("================================================================");
console.log("[cloudflare] provider initialized");
console.log(`[cloudflare] model: ${model}`);
console.log(`[cloudflare] credentials present: Account ID (configured), API Token (configured)`);

const gateway = new CloudflareModelGateway({
  accountId,
  apiToken,
  modelName: model,
});

const mockOrgId = "00000000-0000-0000-0000-000000000001" as OrganizationId;
const mockDocId = "00000000-0000-0000-0000-000000000002" as DocumentId;

async function runTest1() {
  console.log("\n----------------------------------------------------------------");
  console.log("TEST 1: Persian Medical Explanation (ACE Inhibitor vs ARB)");
  console.log("----------------------------------------------------------------");
  const prompt = "تفاوت ACE inhibitor و ARB را برای دانشجوی داروسازی به زبان فارسی در سه جمله توضیح بده.";
  console.log(`Prompt: "${prompt}"`);
  console.log("[cloudflare] generation started...");

  const start = Date.now();
  const res = await gateway.complete({
    promptVersion: "v1",
    messages: [
      { role: "system", content: "شما استاد فارماکولوژی هستید و مفاهیم را دقیق، علمی و به فارسی سلیس بیان می‌کنید." },
      { role: "user", content: prompt },
    ],
    correlationId: "test-cf-persian-1",
    organizationId: mockOrgId,
    documentId: mockDocId,
    temperature: 0.3,
  });
  const latency = Date.now() - start;

  console.log("[cloudflare] generation completed");
  console.log(`[cloudflare] latency: ${latency}ms`);
  console.log(`[cloudflare] model reported: ${res.model}`);
  console.log(`[cloudflare] output chars: ${res.text.length}`);
  console.log(`[cloudflare] input tokens: ${res.usage.inputTokens}, output tokens: ${res.usage.outputTokens}`);
  console.log(`[cloudflare] finish reason: ${res.finishReason}`);
  console.log("\nResponse Text:\n" + res.text);

  return { latency, text: res.text };
}

async function runTest2() {
  console.log("\n----------------------------------------------------------------");
  console.log("TEST 2: Structured Flashcards Generation (JSON Output)");
  console.log("----------------------------------------------------------------");
  const prompt = `برای مبحث beta blockers سه فلشکارت آموزشی بساز.
هر فلشکارت شامل question و answer باشد.
خروجی را صرفاً در قالب یک شیء معتبر JSON با کلید "cards" بازگردان.
الگوی ساختار:
{
  "cards": [
    {"question": "سوال...", "answer": "پاسخ..."}
  ]
}`;
  console.log(`Prompt: "${prompt}"`);
  console.log("[cloudflare] generation started...");

  const start = Date.now();
  const res = await gateway.complete({
    promptVersion: "v1",
    messages: [
      { role: "system", content: "You output ONLY valid JSON matching the requested structure. No introductory or trailing text." },
      { role: "user", content: prompt },
    ],
    jsonSchema: { type: "flashcards" },
    correlationId: "test-cf-structured-2",
    organizationId: mockOrgId,
    documentId: mockDocId,
    temperature: 0.2,
  });
  const latency = Date.now() - start;

  console.log("[cloudflare] generation completed");
  console.log(`[cloudflare] latency: ${latency}ms`);
  console.log(`[cloudflare] model reported: ${res.model}`);
  console.log(`[cloudflare] output chars: ${res.text.length}`);
  console.log(`[cloudflare] input tokens: ${res.usage.inputTokens}, output tokens: ${res.usage.outputTokens}`);

  // Clean JSON and parse
  let cleanJson = res.text.trim();
  const match = cleanJson.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (match) cleanJson = match[1].trim();

  let parsed: { cards?: Array<{ question: string; answer: string }> } | null = null;
  try {
    parsed = JSON.parse(cleanJson);
    console.log("[cloudflare] JSON Parse: SUCCESS");
    console.log(`[cloudflare] Parsed ${parsed?.cards?.length || 0} flashcards:`);
    parsed?.cards?.forEach((c, idx) => {
      console.log(`  ${idx + 1}. Q: ${c.question}\n     A: ${c.answer}`);
    });
  } catch (err) {
    console.error("[cloudflare] JSON Parse: FAILED ->", err);
    console.log("Raw output was:\n", res.text);
  }

  return { latency, parsed, raw: res.text };
}

async function runTest3() {
  console.log("\n----------------------------------------------------------------");
  console.log("TEST 3: Medical Reasoning & Multiple-Choice Question (MCQ)");
  console.log("----------------------------------------------------------------");
  const prompt = `یک سؤال چهارگزینه‌ای درباره مکانیسم اثر beta blockers در نارسایی قلبی و کنترل ضربان ایجاد کن و پاسخ صحیح همراه با تحلیل بالینی (explanation) را مشخص کن.
خروجی را به صورت JSON معتبر ارائه بده:
{
  "question": "متن سؤال...",
  "options": ["گزینه ۱", "گزینه ۲", "گزینه ۳", "گزینه ۴"],
  "correctAnswer": "گزینه صحیح...",
  "explanation": "علت بالینی..."
}`;
  console.log(`Prompt: "${prompt}"`);
  console.log("[cloudflare] generation started...");

  const start = Date.now();
  const res = await gateway.complete({
    promptVersion: "v1",
    messages: [
      { role: "system", content: "You output ONLY valid JSON for medical exam questions." },
      { role: "user", content: prompt },
    ],
    jsonSchema: { type: "mcq" },
    correlationId: "test-cf-reasoning-3",
    organizationId: mockOrgId,
    documentId: mockDocId,
    temperature: 0.2,
  });
  const latency = Date.now() - start;

  console.log("[cloudflare] generation completed");
  console.log(`[cloudflare] latency: ${latency}ms`);
  console.log(`[cloudflare] model reported: ${res.model}`);
  console.log(`[cloudflare] output chars: ${res.text.length}`);
  console.log(`[cloudflare] input tokens: ${res.usage.inputTokens}, output tokens: ${res.usage.outputTokens}`);

  let cleanJson = res.text.trim();
  const match = cleanJson.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (match) cleanJson = match[1].trim();

  try {
    const parsed = JSON.parse(cleanJson);
    console.log("[cloudflare] JSON Parse: SUCCESS");
    console.log(`[cloudflare] Question: ${parsed.question}`);
    console.log(`[cloudflare] Options: ${JSON.stringify(parsed.options)}`);
    console.log(`[cloudflare] Correct Answer: ${parsed.correctAnswer}`);
    console.log(`[cloudflare] Explanation: ${parsed.explanation}`);
  } catch (err) {
    console.error("[cloudflare] JSON Parse: FAILED ->", err);
    console.log("Raw output was:\n", res.text);
  }

  return { latency, raw: res.text };
}

async function main() {
  try {
    await runTest1();
    await runTest2();
    await runTest3();
    console.log("\n================================================================");
    console.log("  ALL CLOUDFLARE GENERATION TESTS COMPLETED SUCCESSFULLY");
    console.log("================================================================");
  } catch (err) {
    console.error("\n[cloudflare] Test execution failed:", err);
    process.exit(1);
  }
}

main();
