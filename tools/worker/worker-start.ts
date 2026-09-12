/**
 * AVANA Worker Process Supervisor.
 *
 * Starts Docker infrastructure (if needed) and concurrently spawns:
 * 1. AVANA API (Fastify + inline BullMQ content generation worker)
 * 2. AVANA Web (Vite frontend)
 *
 * Streams formatted output with prefixes: [api] and [web]
 * Handles graceful termination (Ctrl+C / SIGINT / SIGTERM) cleanly on Windows, Linux, and macOS.
 *
 * Usage:
 *   npm run worker:start
 */

import { spawn, execSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { parseEnvFile, validateDatabaseUrlForWorker } from "./worker-env.js";

const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

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

function pipeWithPrefix(
  stream: NodeJS.ReadableStream | null,
  outStream: NodeJS.WritableStream,
  prefix: string,
) {
  if (!stream) return;
  let buffer = "";
  stream.on("data", (chunk: Buffer) => {
    buffer += chunk.toString("utf8");
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (line.trim().length > 0) {
        outStream.write(`${prefix} ${line}\n`);
      }
    }
  });
  stream.on("end", () => {
    if (buffer.trim().length > 0) {
      outStream.write(`${prefix} ${buffer}\n`);
    }
  });
}

function terminateProcess(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (!child.pid || child.killed) {
      resolve();
      return;
    }

    const pid = child.pid;
    if (process.platform === "win32") {
      try {
        execSync(`taskkill /pid ${pid} /T /F`, { stdio: "ignore" });
      } catch {
        // ignore error
      }
      resolve();
    } else {
      try {
        process.kill(-pid, "SIGTERM");
      } catch {
        try {
          child.kill("SIGTERM");
        } catch {
          // ignore error
        }
      }
      setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          // ignore
        }
        resolve();
      }, 1500);
    }
  });
}

async function main() {
  const rootDir = process.cwd();
  const envPath = path.join(rootDir, ".env");

  if (!fs.existsSync(envPath)) {
    process.stderr.write(
      `${RED}✖ No .env file found. Please run 'npm run worker:setup' first.${RESET}\n`,
    );
    process.exit(1);
  }

  const envData = parseEnvFile(envPath);

  // Strict Fail-Closed Check on DATABASE_URL
  try {
    validateDatabaseUrlForWorker(envData.DATABASE_URL);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`${RED}${msg}${RESET}\n`);
    process.exit(1);
  }

  const workerId = envData.WORKER_ID || "worker-001";
  const projectName = `avana-worker-${workerId}`;
  const composePath = path.join(rootDir, "infra", "local", "compose.yaml");

  process.stdout.write("\n");
  process.stdout.write(`${BOLD}=====================================================${RESET}\n`);
  process.stdout.write(`${BOLD}        Starting AVANA Worker Environment            ${RESET}\n`);
  process.stdout.write(`${BOLD}=====================================================${RESET}\n\n`);

  // 1. Ensure Docker containers are running
  let dbPort = Number(envData.DATABASE_PORT || 55432);
  if (envData.DATABASE_URL) {
    try {
      const parsed = new URL(envData.DATABASE_URL);
      if (parsed.port) dbPort = Number(parsed.port);
    } catch {
      // ignore parse error
    }
  }

  let redisPort = Number(envData.REDIS_PORT || 56379);
  if (envData.REDIS_URL) {
    try {
      const parsed = new URL(envData.REDIS_URL);
      if (parsed.port) redisPort = Number(parsed.port);
    } catch {
      // ignore parse error
    }
  }

  const pgRunning = await isPortReachable(dbPort);
  const redisRunning = await isPortReachable(redisPort);

  if (!pgRunning || !redisRunning) {
    let dockerInstalled = true;
    try {
      execSync("docker --version", { stdio: "ignore" });
    } catch {
      dockerInstalled = false;
    }

    if (!dockerInstalled) {
      process.stderr.write(`${RED}Local PostgreSQL (port ${dbPort}) and/or Redis (port ${redisPort}) are not active, and Docker is not installed.${RESET}\n`);
      process.exit(1);
    }

    process.stdout.write(`ℹ Starting Docker containers for project ${projectName} (PostgreSQL: ${dbPort}, Redis: ${redisPort})...\n`);
    try {
      execSync(`docker compose -f "${composePath}" -p "${projectName}" up -d`, {
        stdio: "inherit",
        env: {
          ...process.env,
          ...envData,
          POSTGRES_PORT: String(dbPort),
          REDIS_PORT: String(redisPort),
        },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`${RED}Failed to start Docker containers: ${msg}${RESET}\n`);
      process.exit(1);
    }
  }

  const children: ChildProcess[] = [];
  let isShuttingDown = false;

  async function shutdown(signal: string) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    process.stdout.write(`\n${YELLOW}Received ${signal}. Gracefully stopping Worker services...${RESET}\n`);
    await Promise.all(children.map((c) => terminateProcess(c)));
    process.stdout.write(`${GREEN}✓ Worker services stopped.${RESET}\n\n`);
    process.exit(0);
  }

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  if (process.platform !== "win32") {
    process.on("SIGHUP", () => shutdown("SIGHUP"));
  }

  // 2. Spawn API Server (which includes the inline BullMQ worker in dev.ts)
  const apiPrefix = `${CYAN}[api]${RESET}`;
  const isWindows = process.platform === "win32";
  const npmCmd = isWindows ? "npm.cmd" : "npm";

  process.stdout.write(`${GREEN}✓${RESET} Spawning API Server on port ${envData.AVANA_API_PORT || 3000}...\n`);

  const apiChild = spawn(
    npmCmd,
    ["run", "dev", "--workspace=@avana/api"],
    {
      cwd: rootDir,
      env: {
        ...process.env,
        ...envData,
        NODE_ENV: "development",
        WORKER_MODE: "true",
      },
      stdio: ["ignore", "pipe", "pipe"],
      detached: !isWindows,
    },
  );
  children.push(apiChild);

  pipeWithPrefix(apiChild.stdout, process.stdout, apiPrefix);
  pipeWithPrefix(apiChild.stderr, process.stderr, apiPrefix);

  // 3. Spawn Web Frontend
  const webPrefix = `${GREEN}[web]${RESET}`;
  process.stdout.write(`${GREEN}✓${RESET} Spawning Web Client on port 5173...\n\n`);

  const webChild = spawn(
    npmCmd,
    ["run", "dev", "--workspace=@avana/web"],
    {
      cwd: rootDir,
      env: {
        ...process.env,
        ...envData,
        NODE_ENV: "development",
      },
      stdio: ["ignore", "pipe", "pipe"],
      detached: !isWindows,
    },
  );
  children.push(webChild);

  pipeWithPrefix(webChild.stdout, process.stdout, webPrefix);
  pipeWithPrefix(webChild.stderr, process.stderr, webPrefix);

  apiChild.on("exit", (code, sig) => {
    if (!isShuttingDown) {
      process.stdout.write(`${RED}[api] exited with code ${code ?? sig}${RESET}\n`);
      shutdown("API EXIT");
    }
  });

  webChild.on("exit", (code, sig) => {
    if (!isShuttingDown) {
      process.stdout.write(`${RED}[web] exited with code ${code ?? sig}${RESET}\n`);
      shutdown("WEB EXIT");
    }
  });
}

main().catch((err) => {
  process.stderr.write(`Fatal error: ${err.message}\n`);
  process.exit(1);
});
