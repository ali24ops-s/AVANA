import fs from "fs";

function loadEnv() {
  const content = fs.readFileSync(".env", "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx > 0) {
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      process.env[key] = val;
    }
  }
}

async function testGemini() {
  loadEnv();
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || "gemini-3.6-flash";
  console.log("Model:", model, "API Key present:", !!apiKey);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  console.log("Sending request to:", url);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: 'Hello! Return JSON: {"message": "Persian test سلام"}' }],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
      },
    }),
  });

  console.log("Status:", res.status, res.statusText);
  const body = await res.text();
  console.log("Body:", body);
}

testGemini().catch(console.error);
