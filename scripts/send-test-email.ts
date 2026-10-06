/**
 * Test script to dispatch live test emails using ResendEmailService.
 * Usage:
 *   npx tsx scripts/send-test-email.ts <recipient-email>
 */

import { loadMonorepoEnv } from "@avana/config";
import { ResendEmailService } from "../apps/api/src/modules/identity/email-service.js";

loadMonorepoEnv();

const apiKey = process.env.RESEND_API_KEY;
const fromEmail = process.env.EMAIL_FROM || "AVANA <onboarding@resend.dev>";
const appUrl = process.env.AVANA_APP_URL || process.env.APP_URL || "https://aavana.ir";

if (!apiKey) {
  console.error("❌ Error: RESEND_API_KEY is not defined in environment or .env");
  process.exit(1);
}

const recipient = process.argv[2];

if (!recipient) {
  console.error("❌ Error: Please provide a recipient email address.");
  console.log("Usage: npx tsx scripts/send-test-email.ts <recipient-email>");
  process.exit(1);
}

console.log("=========================================");
console.log("AVANA Live Email Dispatch Test");
console.log("=========================================");
console.log("Recipient:", recipient);
console.log("From:", fromEmail);
console.log("App URL:", appUrl);
console.log("=========================================");

const emailService = new ResendEmailService(apiKey, fromEmail, globalThis.fetch, appUrl);

async function main() {
  try {
    console.log("1. Sending Verification Code Email...");
    await emailService.sendVerificationCode(recipient, "739281");
    console.log("✅ Verification Code Email sent successfully!");

    console.log("\n2. Sending Password Reset Email...");
    const sampleResetUrl = `${appUrl.replace(/\/+$/, "")}/reset-password?token=live_test_sample_token_8899aabbcc`;
    await emailService.sendPasswordResetEmail(recipient, sampleResetUrl);
    console.log("✅ Password Reset Email sent successfully!");

    console.log("\n🎉 Both test emails have been dispatched via Resend API.");
  } catch (err: unknown) {
    console.error("❌ Dispatch failed:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main();
