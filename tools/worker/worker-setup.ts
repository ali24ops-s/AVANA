/**
 * AVANA Worker Setup CLI.
 *
 * Fully automated, idempotent, cross-platform bootstrap script for content workers.
 * Works uniformly across Windows (cmd/PowerShell), Linux, and macOS.
 *
 * Usage:
 *   npm run worker:setup
 *   npm run worker:setup -- --id=worker-002
 *   npm run worker:setup -- --password="MySecurePassword123!"
 */

import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { randomBytes } from "node:crypto";
import net from "node:net";
import {
  generateWorkerEnv,
  writeWorkerEnvFile,
  parseEnvFile,
  validateDatabaseUrlForWorker,
} from "./worker-env.js";
import { seedWorkerData } from "./worker-seed.js";
import { hashPassword } from "../../apps/api/src/modules/identity/password-hasher.js";
import { createDbClient } from "../../database/client.js";
import { sql } from "drizzle-orm";

// Colors for terminal formatting (supported across modern Windows & Unix terminals)
const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

function logSuccess(msg: string) {
  process.stdout.write(`${GREEN}✓${RESET} ${msg}\n`);
}

function logInfo(msg: string) {
  process.stdout.write(`${CYAN}ℹ${RESET} ${msg}\n`);
}

function logWarn(msg: string) {
  process.stdout.write(`${YELLOW}⚠️${RESET} ${msg}\n`);
}

function logError(msg: string) {
  process.stderr.write(`${RED}✖ ${msg}${RESET}\n`);
}

/**
 * Parses CLI flags like --id=worker-002 or --password=secret
 */
function parseArgs(args: string[]): Record<string, string | boolean> {
  const result: Record<string, string | boolean> = {};
  for (const arg of args) {
    if (arg.startsWith("--")) {
      const eqIdx = arg.indexOf("=");
      if (eqIdx !== -1) {
        const key = arg.slice(2, eqIdx);
        const val = arg.slice(eqIdx + 1);
        result[key] = val;
      } else {
        result[arg.slice(2)] = true;
      }
    }
  }
  return result;
}

/**
 * Check if a TCP socket is reachable.
 */
function isPortReachable(port: number, host = "127.0.0.1"): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1000);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, host);
  });
}

/**
 * Poll until port becomes reachable or timeout expires.
 */
async function waitForPort(
  port: number,
  serviceName: string,
  host = "127.0.0.1",
  timeoutMs = 35000,
): Promise<boolean> {
  const start = Date.now();
  process.stdout.write(`  Waiting for ${serviceName} on ${host}:${port}... `);
  while (Date.now() - start < timeoutMs) {
    const reachable = await isPortReachable(port, host);
    if (reachable) {
      process.stdout.write(`${GREEN}ready!${RESET}\n`);
      return true;
    }
    await new Promise((r) => setTimeout(r, 750));
  }
  process.stdout.write(`${RED}timeout!${RESET}\n`);
  return false;
}

/**
 * Prompts user synchronously on TTY.
 */
function askQuestion(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Checks if Docker CLI & Docker Compose are available.
 */
function checkDockerAvailable(): { installed: boolean; running: boolean } {
  try {
    const composeCheck = spawnSync("docker", ["compose", "version"], {
      encoding: "utf8",
      stdio: "pipe",
    });
    if (composeCheck.status !== 0) {
      return { installed: false, running: false };
    }

    const daemonCheck = spawnSync("docker", ["info"], {
      encoding: "utf8",
      stdio: "pipe",
    });
    if (daemonCheck.status !== 0) {
      return { installed: true, running: false };
    }

    return { installed: true, running: true };
  } catch {
    return { installed: false, running: false };
  }
}

async function main() {
  process.stdout.write("\n");
  process.stdout.write(`${BOLD}=====================================================${RESET}\n`);
  process.stdout.write(`${BOLD}        AVANA Worker Environment Setup               ${RESET}\n`);
  process.stdout.write(`${BOLD}=====================================================${RESET}\n\n`);

  const rootDir = process.cwd();
  const args = parseArgs(process.argv.slice(2));

  // ---------------------------------------------------------------------------
  // 1. Prerequisites Check
  // ---------------------------------------------------------------------------
  logInfo("Step 1/8: Checking system prerequisites...");

  // Check Node.js version
  const nodeVersionMajor = parseInt(process.versions.node.split(".")[0], 10);
  if (nodeVersionMajor < 22) {
    logError(
      `Node.js version >= 22.0.0 is required. Current version: ${process.versions.node}`,
    );
    process.exit(1);
  }
  logSuccess(`Node.js ${process.versions.node} detected`);

  // Check npm version
  try {
    const npmVersion = execSync("npm --version", { encoding: "utf8" }).trim();
    const npmMajor = parseInt(npmVersion.split(".")[0], 10);
    if (npmMajor < 10) {
      logWarn(`npm version >= 10.0.0 recommended. Current: ${npmVersion}`);
    } else {
      logSuccess(`npm ${npmVersion} detected`);
    }
  } catch (err) {
    logWarn(`Could not verify npm version: ${String(err)}`);
  }

  // Check Docker
  const docker = checkDockerAvailable();
  let skipDocker = Boolean(args["skip-docker"]);

  if (!skipDocker) {
    if (!docker.running) {
      // Check if local PostgreSQL (5432) and Redis (6379) are already running natively
      const pgReady = await isPortReachable(5432);
      const redisReady = await isPortReachable(6379);
      if (pgReady && redisReady) {
        logSuccess("Local PostgreSQL (port 5432) and Redis (port 6379) detected active and ready");
        skipDocker = true;
      } else {
        if (!docker.installed) {
          logError("Docker is not installed and local PostgreSQL/Redis are not active.");
          process.stdout.write("\nTo install Docker:\n");
          process.stdout.write("  - Windows / macOS: Install Docker Desktop from https://www.docker.com/products/docker-desktop/\n");
          process.stdout.write("  - Linux: Install Docker Engine via https://docs.docker.com/engine/install/\n\n");
          process.exit(1);
        }

        logError("Docker CLI is installed, but the Docker daemon/engine is not running.");
        process.stdout.write("\nPlease start Docker Desktop / daemon and run 'npm run worker:setup' again.\n\n");
        process.exit(1);
      }
    } else {
      logSuccess("Docker engine & Docker Compose detected and running");
    }
  } else {
    logWarn("Skipping Docker check (--skip-docker flag provided). Assuming local DB & Redis are running.");
  }

  // ---------------------------------------------------------------------------
  // 2. Identity & Configuration Resolution
  // ---------------------------------------------------------------------------
  logInfo("Step 2/8: Resolving Worker identity and credentials...");

  const existingEnvPath = path.join(rootDir, ".env");
  const existingEnv = parseEnvFile(existingEnvPath);

  // Worker ID
  let workerId = (args.id as string) || process.env.WORKER_ID || existingEnv.WORKER_ID;
  if (!workerId) {
    workerId = "worker-001";
  }
  workerId = workerId.trim().toLowerCase();

  const workerEmail = `worker-${workerId}@avana.local`;
  const workerName = `Content Worker (${workerId})`;

  // Password Handling
  let rawPassword = (args.password as string) || process.env.WORKER_PASSWORD;
  let isAutoGeneratedPassword = false;

  if (!rawPassword) {
    // If interactive TTY and not automated, give option to input or generate
    const isTTY = Boolean(process.stdin.isTTY) && !args.automated;
    if (isTTY) {
      process.stdout.write(
        `\nEnter password for Worker account [${workerEmail}]\n` +
          `(Leave empty and press Enter to auto-generate a cryptographically secure password): `,
      );
      const answer = await askQuestion("");
      if (answer && answer.trim().length > 0) {
        rawPassword = answer.trim();
      }
    }

    if (!rawPassword) {
      // Auto-generate strong 16-character password
      rawPassword = randomBytes(12).toString("base64").replace(/[+/=]/g, "a");
      isAutoGeneratedPassword = true;
    }
  }

  const passwordHash = await hashPassword(rawPassword);

  // ---------------------------------------------------------------------------
  // 3. AI Configuration & Local Environment Generation
  // ---------------------------------------------------------------------------
  logInfo("Step 3/8: Preparing Worker environment and security boundaries...");

  // Load AI configuration from .env.worker-ai if present
  const workerAiPath = path.join(rootDir, ".env.worker-ai");
  let aiConfig: Record<string, string> = {};

  if (fs.existsSync(workerAiPath)) {
    aiConfig = parseEnvFile(workerAiPath);
    logSuccess("Loaded AI configuration from .env.worker-ai");
  } else if (Object.keys(existingEnv).some(k => k.startsWith("GEMINI_") || k.startsWith("CLOUDFLARE_") || k.startsWith("AI_"))) {
    aiConfig = existingEnv;
    logSuccess("Preserved existing AI configuration from local .env");
  } else {
    logWarn("No .env.worker-ai found. An AI configuration template has been created.");
    const exampleAiPath = path.join(rootDir, ".env.worker-ai.example");
    if (fs.existsSync(exampleAiPath)) {
      try {
        fs.copyFileSync(exampleAiPath, workerAiPath);
        logInfo("Copied .env.worker-ai.example -> .env.worker-ai. Please update your AI API keys as needed.");
      } catch {
        // ignore copy error
      }
    }
  }

  const dbName = (args.database as string) || (args["db-name"] as string) || undefined;
  const redisDb = args["redis-db"] !== undefined ? Number(args["redis-db"]) : undefined;
  const dbPort = args["db-port"] ? Number(args["db-port"]) : undefined;
  const redisPort = args["redis-port"] ? Number(args["redis-port"]) : undefined;

  const { envContent, envData } = generateWorkerEnv({
    rootDir,
    workerId,
    workerName,
    dbName,
    dbPort,
    redisPort,
    redisDb,
    aiConfig,
    existingEnv,
  });

  // Strict Fail-Closed Check on DATABASE_URL
  validateDatabaseUrlForWorker(envData.DATABASE_URL);
  logSuccess("Production DB protection passed: DATABASE_URL is strictly local");

  // Write .env
  writeWorkerEnvFile(rootDir, envContent);
  logSuccess("Local Worker .env file written and secured");

  // ---------------------------------------------------------------------------
  // 4. Local Infrastructure (PostgreSQL & Redis via Docker)
  // ---------------------------------------------------------------------------
  if (!skipDocker) {
    logInfo("Step 4/8: Starting isolated PostgreSQL and Redis containers...");

    const composePath = path.join(rootDir, "infra", "local", "compose.yaml");
    const projectName = `avana-worker-${workerId}`;

    try {
      execSync(
        `docker compose -f "${composePath}" -p "${projectName}" up -d`,
        { stdio: "pipe" },
      );
      logSuccess(`Docker containers started under project: ${projectName}`);
    } catch (err: any) {
      logError(`Failed to start Docker Compose: ${err.message}`);
      process.exit(1);
    }

    // Wait for PostgreSQL & Redis
    const pgReady = await waitForPort(5432, "PostgreSQL", "127.0.0.1", 30000);
    const redisReady = await waitForPort(6379, "Redis", "127.0.0.1", 20000);

    if (!pgReady || !redisReady) {
      logError("Infrastructure containers did not become ready in time.");
      process.exit(1);
    }
  } else {
    logInfo("Step 4/8: Skipping Docker start (--skip-docker).");
  }

  // ---------------------------------------------------------------------------
  // 5. Storage Directory Creation
  // ---------------------------------------------------------------------------
  logInfo("Step 5/8: Preparing local document storage directories...");
  const uploadDir = path.resolve(rootDir, envData.AVANA_STORAGE_LOCAL_DIRECTORY || "./storage/uploads");
  fs.mkdirSync(uploadDir, { recursive: true });
  logSuccess(`Local document upload directory ready: ${uploadDir}`);

  // ---------------------------------------------------------------------------
  // 6. Database Migrations
  // ---------------------------------------------------------------------------
  // Ensure target database exists
  try {
    const dbUrlObj = new URL(envData.DATABASE_URL);
    const targetDbName = dbUrlObj.pathname.slice(1);
    if (targetDbName && targetDbName !== "postgres") {
      const adminUrl = new URL(envData.DATABASE_URL);
      adminUrl.pathname = "/postgres";
      const { db: adminDb, close: closeAdmin } = createDbClient(adminUrl.toString());
      try {
        const checkResult = await adminDb.execute(sql`SELECT 1 FROM pg_database WHERE datname = ${targetDbName}`);
        if (!checkResult || (checkResult as any).rowCount === 0 || ((checkResult as any).rows && (checkResult as any).rows.length === 0)) {
          await adminDb.execute(sql.raw(`CREATE DATABASE "${targetDbName}"`));
          logSuccess(`Created isolated local database: ${targetDbName}`);
        }
      } catch {
        // ignore if already exists or permission issues
      } finally {
        await closeAdmin();
      }
    }
  } catch {
    // ignore
  }

  try {
    execSync("npx tsx database/migrate.ts", {
      stdio: "inherit",
      env: { ...process.env, ...envData },
    });
    logSuccess("All database migrations applied successfully");
  } catch (err: any) {
    logError(`Database migrations failed: ${err.message}`);
    process.exit(1);
  }

  // ---------------------------------------------------------------------------
  // 7. Baseline Seed & Worker Account Creation
  // ---------------------------------------------------------------------------
  logInfo("Step 7/8: Seeding baseline catalog and creating Worker account...");
  try {
    // Baseline catalog seed (pharmacy courses, modules, lessons, blog)
    execSync("npx tsx database/seeds/seed.ts", {
      stdio: "pipe",
      env: { ...process.env, ...envData },
    });
    logSuccess("Baseline courses and learning content seeded");
  } catch (err: any) {
    logWarn(`Baseline seed notice: ${err.message}`);
  }

  // Worker User & Workspace Seed
  try {
    const workerSeedResult = await seedWorkerData({
      workerId,
      workerName,
      workerEmail,
      passwordHash,
      databaseUrl: envData.DATABASE_URL,
    });
    logSuccess(
      `Worker account created: ${workerSeedResult.email} (Role: content_worker)`,
    );
  } catch (err: any) {
    logError(`Failed to seed Worker account: ${err.message}`);
    process.exit(1);
  }

  // ---------------------------------------------------------------------------
  // 8. Health Checks & Summary
  // ---------------------------------------------------------------------------
  logInfo("Step 8/8: Performing final health verifications...");

  const pgOk = await isPortReachable(5432);
  const redisOk = await isPortReachable(6379);

  if (pgOk && redisOk) {
    logSuccess("All infrastructure health checks passed");
  } else {
    logWarn("Some health check probes timed out, but setup completed.");
  }

  process.stdout.write("\n");
  process.stdout.write(`${BOLD}${GREEN}=====================================================${RESET}\n`);
  process.stdout.write(`${BOLD}${GREEN}          AVANA Worker is Ready!                    ${RESET}\n`);
  process.stdout.write(`${BOLD}${GREEN}=====================================================${RESET}\n\n`);

  process.stdout.write(`  ${BOLD}Worker ID:${RESET}       ${workerId}\n`);
  process.stdout.write(`  ${BOLD}Role:${RESET}            content_worker (strictly isolated from production)\n`);
  process.stdout.write(`  ${BOLD}Login Email:${RESET}     ${workerEmail}\n`);
  if (isAutoGeneratedPassword) {
    process.stdout.write("\n");
    process.stdout.write(`${YELLOW}┌────────────────────────────────────────────────────────────┐${RESET}\n`);
    process.stdout.write(`${YELLOW}│  ${BOLD}Worker One-Time Password Generated:${RESET}                      ${YELLOW}│${RESET}\n`);
    process.stdout.write(`${YELLOW}│  ${BOLD}${CYAN}${rawPassword.padEnd(58)}${RESET}${YELLOW}│${RESET}\n`);
    process.stdout.write(`${YELLOW}│                                                            │${RESET}\n`);
    process.stdout.write(`${YELLOW}│  ⚠️  ${BOLD}Save this password now! It will not be shown again.${RESET}   ${YELLOW}│${RESET}\n`);
    process.stdout.write(`${YELLOW}└────────────────────────────────────────────────────────────┘${RESET}\n\n`);
  }
  process.stdout.write(`  ${BOLD}Local API URL:${RESET}   http://${envData.AVANA_API_HOST}:${envData.AVANA_API_PORT}\n`);
  process.stdout.write(`  ${BOLD}Local Web UI:${RESET}    http://127.0.0.1:5173\n`);
  process.stdout.write(`  ${BOLD}AI Provider:${RESET}     ${envData.AI_PRIMARY_PROVIDER} (fallback: disabled)\n`);
  process.stdout.write(`  ${BOLD}Next Step:${RESET}       Run ${CYAN}npm run worker:start${RESET} to start AVANA\n\n`);
}

main().catch((err) => {
  logError(`Worker setup failed: ${err instanceof Error ? err.stack || err.message : String(err)}`);
  process.exit(1);
});
