/**
 * AVANA Worker Stop CLI.
 *
 * Stops running local Docker containers for the worker environment
 * while preserving all database volumes, uploaded files, and configurations.
 *
 * Usage:
 *   npm run worker:stop
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { parseEnvFile } from "./worker-env.js";

const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";
const RESET = "\x1b[0m";

function main() {
  const rootDir = process.cwd();
  const envPath = path.join(rootDir, ".env");
  let workerId = "worker-001";

  if (fs.existsSync(envPath)) {
    const envData = parseEnvFile(envPath);
    if (envData.WORKER_ID) {
      workerId = envData.WORKER_ID;
    }
  }

  const projectName = `avana-worker-${workerId}`;
  const composePath = path.join(rootDir, "infra", "local", "compose.yaml");

  process.stdout.write(`\nStopping Docker containers for project ${CYAN}${projectName}${RESET}...\n`);

  try {
    execSync("docker --version", { stdio: "ignore" });
  } catch {
    process.stdout.write(`\nDocker is not installed on this system. (Running on native local infrastructure).\n`);
    process.stdout.write(`  Database volumes and local uploads remain preserved.\n`);
    process.stdout.write(`  Run ${CYAN}npm run worker:start${RESET} whenever you wish to resume.\n\n`);
    return;
  }

  try {
    execSync(`docker compose -f "${composePath}" -p "${projectName}" stop`, {
      stdio: "inherit",
    });
    process.stdout.write(`\n${GREEN}✓ Worker Docker infrastructure stopped safely.${RESET}\n`);
    process.stdout.write("  Database volumes and local uploads remain preserved.\n");
    process.stdout.write(`  Run ${CYAN}npm run worker:start${RESET} whenever you wish to resume.\n\n`);
  } catch (err: any) {
    process.stderr.write(`Could not stop Docker containers: ${err.message}\n`);
    process.exit(1);
  }
}

main();
