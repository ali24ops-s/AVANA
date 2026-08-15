import { loadMonorepoEnv } from "@avana/config";
import { CloudflareModelGateway, DEFAULT_CLOUDFLARE_AI_MODEL } from "../apps/api/src/modules/generation/gateway/cloudflare.js";

loadMonorepoEnv();

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const apiToken = process.env.CLOUDFLARE_API_TOKEN;
const model = process.env.CLOUDFLARE_AI_MODEL || DEFAULT_CLOUDFLARE_AI_MODEL;

if (!accountId || !apiToken) {
  console.error("Missing Cloudflare credentials in environment.");
  process.exit(1);
}

async function run() {
  const gateway = new CloudflareModelGateway({
    accountId,
    apiToken,
    modelName: model,
  });

  const prompt = "تفاوت ACE inhibitor و ARB را برای یک دانشجوی داروسازی در ۳ جمله توضیح بده.";
  const response = await gateway.complete({
    prompt,
    systemInstruction: "You are an expert pharmacology tutor. Answer accurately in Persian.",
    temperature: 0.3,
  });

  console.log("Model:", response.model);
  console.log("Output Length:", response.text.length);
  console.log("Response:", response.text);
}

run().catch((err) => {
  console.error("Single call failed:", err);
  process.exit(1);
});
