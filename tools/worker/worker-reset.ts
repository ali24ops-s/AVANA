/**
 * AVANA Worker Environment Reset CLI.
 *
 * Destructive operation:
 * 1. Requires exact confirmation typing 'YES'.
 * 2. Stops and completely removes local Docker containers and data volumes (Postgres + Redis).
 * 3. Cleans local file uploads in ./storage/uploads/
 * 4. Preserves AI configuration (.env.worker-ai), source code, and git repository.
 *
 * Usage:
 *   npm run worker:reset
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { parseEnvFile } from "./worker-env.js";

const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

function askConfirmation(prompt: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  const rootDir = process.cwd();
  const envPath = path.join(rootDir, ".env");
  let workerId = "worker-001";

  if (fs.existsSync(envPath)) {
    const envData = parseEnvFile(envPath);
    if (envData.WORKER_ID) {
      workerId = envData.WORKER_ID;
    }
  }

  process.stdout.write("\n");
  process.stdout.write(`${BOLD}${RED}=====================================================${RESET}\n`);
  process.stdout.write(`${BOLD}${RED}       AVANA Worker Reset — Destructive Action       ${RESET}\n`);
  process.stdout.write(`${BOLD}${RED}=====================================================${RESET}\n\n`);

  process.stdout.write(`${YELLOW}⚠️  WARNING:${RESET} This action will permanently wipe your local Worker data:\n`);
  process.stdout.write(`  - All local PostgreSQL databases and tables will be DELETED.\n`);
  process.stdout.write(`  - All local Redis cache and BullMQ queues will be PURGED.\n`);
  process.stdout.write(`  - All locally uploaded documents in ./storage/uploads will be REMOVED.\n`);
  process.stdout.write(`  - Your AI configuration (.env.worker-ai) and source code will be PRESERVED.\n\n`);

  // Check if automated flag passed (--force or --yes)
  const isForce = process.argv.includes("--force") || process.argv.includes("--yes");
  let confirmed = false;

  if (isForce) {
    confirmed = true;
  } else {
    const answer = await askConfirmation(
      `${BOLD}Type exact 'YES' to proceed with wiping the worker environment: ${RESET}`,
    );
    if (answer === "YES") {
      confirmed = true;
    }
  }

  if (!confirmed) {
    process.stdout.write(`\n${GREEN}Reset aborted. No data was deleted.${RESET}\n\n`);
    process.exit(0);
  }

  process.stdout.write(`\nResetting Worker environment (Project: avana-worker-${workerId})...\n`);

  // 1. Remove Docker containers and volumes
  const projectName = `avana-worker-${workerId}`;
  const composePath = path.join(rootDir, "infra", "local", "compose.yaml");

  try {
    let dockerInstalled = true;
    try {
      execSync("docker --version", { stdio: "ignore" });
    } catch {
      dockerInstalled = false;
    }

    if (dockerInstalled) {
      execSync(`docker compose -f "${composePath}" -p "${projectName}" down -v`, {
        stdio: "inherit",
      });
      process.stdout.write(`${GREEN}✓ Docker containers and volumes wiped successfully.${RESET}\n`);
    } else {
      process.stdout.write(`ℹ Docker not installed on host. Docker wipe skipped.\n`);
    }
  } catch (err: any) {
    process.stderr.write(`${RED}Note on Docker containers: ${err.message}${RESET}\n`);
  }

  // 2. Clear local storage uploads
  const uploadDir = path.resolve(rootDir, "storage", "uploads");
  if (fs.existsSync(uploadDir)) {
    try {
      const files = fs.readdirSync(uploadDir);
      for (const file of files) {
        if (file === ".gitkeep") continue;
        const filePath = path.join(uploadDir, file);
        fs.rmSync(filePath, { recursive: true, force: true });
      }
      process.stdout.write(`${GREEN}✓ Local uploaded documents wiped from ./storage/uploads.${RESET}\n`);
    } catch (err: any) {
      process.stderr.write(`${RED}Error cleaning upload directory: ${err.message}${RESET}\n`);
    }
  }

  process.stdout.write(`\n${BOLD}${GREEN}Worker environment has been completely reset.${RESET}\n`);
  process.stdout.write(`Run ${BOLD}npm run worker:setup${RESET} when you are ready to bootstrap again.\n\n`);
}

main().catch((err) => {
  process.stderr.write(`Reset failed: ${err.message}\n`);
  process.exit(1);
});
