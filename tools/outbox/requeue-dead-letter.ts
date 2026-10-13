/**
 * AVANA Telegram Outbox Dead Letter Recovery CLI.
 *
 * Provides safe, selective operational recovery for messages moved to dead_letter:
 * - Does NOT blindly reset all messages.
 * - Validates existence and dead_letter status before requeueing.
 * - Preserves idempotency_key and prepends '[requeued]' to last_error for audit trail.
 * - Zero secrets or credentials printed.
 *
 * Usage:
 *   npx tsx tools/outbox/requeue-dead-letter.ts --list
 *   npx tsx tools/outbox/requeue-dead-letter.ts --id <UUID>
 *   npx tsx tools/outbox/requeue-dead-letter.ts --id <UUID> --no-reset
 */

/* eslint-disable no-console */
import { loadMonorepoEnv } from "@avana/config";
import { createDbClient } from "../../database/client.js";
import { DrizzleTelegramOutboxStore } from "../../apps/api/src/observability/telegram-outbox-store.js";

loadMonorepoEnv();

function localConnectionString(): string {
  const user = "avana";
  const password = "avana";
  const host = "127.0.0.1";
  const port = "5432";
  const db = "avana";
  return `postgres://${user}:${password}@${host}:${port}/${db}`;
}

const connectionString = process.env.DATABASE_URL ?? localConnectionString();

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isList = args.includes("--list");
  const idIndex = args.indexOf("--id");
  const targetId = idIndex !== -1 && args[idIndex + 1] ? args[idIndex + 1] : undefined;
  const noReset = args.includes("--no-reset");

  if (!isList && !targetId) {
    console.log("AVANA Outbox Dead Letter Recovery Tool");
    console.log("");
    console.log("Usage:");
    console.log("  npx tsx tools/outbox/requeue-dead-letter.ts --list");
    console.log("  npx tsx tools/outbox/requeue-dead-letter.ts --id <RECORD_UUID>");
    console.log("  npx tsx tools/outbox/requeue-dead-letter.ts --id <RECORD_UUID> --no-reset");
    process.exit(1);
  }

  const { db, close } = createDbClient(connectionString);
  const store = new DrizzleTelegramOutboxStore(db);

  try {
    if (isList) {
      const deadLetters = await store.listAll({ status: "dead_letter", limit: 50 });
      console.log(`Found ${deadLetters.length} dead-letter message(s):`);
      console.log("--------------------------------------------------------------------------------");
      for (const msg of deadLetters) {
        console.log(`ID:              ${msg.id}`);
        console.log(`Category:        ${msg.category}`);
        console.log(`Idempotency Key: ${msg.idempotencyKey}`);
        console.log(`Attempts:        ${msg.attempts}/${msg.maxAttempts}`);
        console.log(`Created At:      ${msg.createdAt.toISOString()}`);
        console.log(`Last Error:      ${msg.lastError ?? "(none)"}`);
        console.log("--------------------------------------------------------------------------------");
      }
      return;
    }

    if (targetId) {
      const existing = await store.findById(targetId);
      if (!existing) {
        console.error(`Error: Record with ID "${targetId}" not found in telegram_outbox.`);
        process.exit(1);
      }

      if (existing.status !== "dead_letter") {
        console.error(
          `Error: Record "${targetId}" is in status "${existing.status}", not "dead_letter". Skipping requeue.`,
        );
        process.exit(1);
      }

      console.log(`Requeueing dead-letter record ${targetId} (${existing.category})...`);
      const success = await store.requeueDeadLetter(targetId, {
        resetAttempts: !noReset,
      });

      if (success) {
        console.log(`✓ Record "${targetId}" successfully requeued to "pending".`);
        console.log(`  Attempts: ${noReset ? existing.attempts : 0}`);
        console.log(`  Next attempt: NOW()`);
        console.log(`  Idempotency key retained: ${existing.idempotencyKey}`);
      } else {
        console.error(`Failed to requeue record "${targetId}".`);
        process.exit(1);
      }
    }
  } finally {
    await close();
  }
}

main().catch((err: unknown) => {
  console.error("Operational tool error:", err);
  process.exit(1);
});
