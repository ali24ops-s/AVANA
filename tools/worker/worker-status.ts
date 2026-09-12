/**
 * AVANA Worker Status CLI.
 *
 * Performs real-time health checks on:
 * - PostgreSQL socket (port 5432)
 * - Redis socket (port 6379)
 * - Fastify API server (port 3000 / HTTP /v1/health)
 * - Vite Web client (port 5173 / HTTP)
 * - Docker container runtime status
 *
 * Usage:
 *   npm run worker:status
 */

import http from "node:http";
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { parseEnvFile } from "./worker-env.js";

const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

function checkTcpPort(port: number, host = "127.0.0.1", timeoutMs = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);
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

function checkHttpEndpoint(url: string, timeoutMs = 2000): Promise<{ ok: boolean; status?: number }> {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      resolve({ ok: (res.statusCode ?? 0) < 500, status: res.statusCode });
    });
    req.on("error", () => resolve({ ok: false }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false });
    });
  });
}

async function main() {
  const rootDir = process.cwd();
  const envPath = path.join(rootDir, ".env");

  process.stdout.write("\n");
  process.stdout.write(`${BOLD}=====================================================${RESET}\n`);
  process.stdout.write(`${BOLD}             AVANA Worker Status                     ${RESET}\n`);
  process.stdout.write(`${BOLD}=====================================================${RESET}\n\n`);

  if (!fs.existsSync(envPath)) {
    process.stdout.write(`${YELLOW}⚠️  No .env file found. Run 'npm run worker:setup' to configure.${RESET}\n\n`);
    return;
  }

  const envData = parseEnvFile(envPath);
  const workerId = envData.WORKER_ID || "worker-001";
  const apiPort = Number(envData.AVANA_API_PORT || 3000);
  const webPort = 5173;

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

  process.stdout.write(`  ${BOLD}Worker ID:${RESET}         ${CYAN}${workerId}${RESET}\n`);
  process.stdout.write(`  ${BOLD}AI Provider:${RESET}       ${envData.AI_PRIMARY_PROVIDER || "gemini"} (fallback: ${envData.AI_ENABLE_FALLBACK || "false"})\n`);
  process.stdout.write(`  ${BOLD}Database URL:${RESET}      ${envData.DATABASE_URL || "not set"}\n`);

  const storageDir = path.resolve(rootDir, envData.AVANA_STORAGE_LOCAL_DIRECTORY || "./storage/uploads");
  const storageExists = fs.existsSync(storageDir);
  process.stdout.write(`  ${BOLD}Storage Dir:${RESET}       ${storageDir} (${storageExists ? `${GREEN}ready${RESET}` : `${RED}missing${RESET}`})\n\n`);

  // Probe ports and endpoints
  const [pgUp, redisUp, apiCheck, webCheck] = await Promise.all([
    checkTcpPort(dbPort),
    checkTcpPort(redisPort),
    checkHttpEndpoint(`http://127.0.0.1:${apiPort}/v1/health`),
    checkHttpEndpoint(`http://127.0.0.1:${webPort}`),
  ]);

  process.stdout.write(`${BOLD}Service Probes:${RESET}\n`);
  process.stdout.write(`  ┌───────────────┬──────┬────────────┬─────────────────────────────┐\n`);
  process.stdout.write(`  │ Service       │ Port │ Status     │ Details                     │\n`);
  process.stdout.write(`  ├───────────────┼──────┼────────────┼─────────────────────────────┤\n`);

  const printRow = (name: string, port: string, up: boolean, details: string) => {
    const statusText = up ? `${GREEN}RUNNING${RESET}   ` : `${RED}STOPPED${RESET}   `;
    process.stdout.write(
      `  │ ${name.padEnd(13)} │ ${port.padEnd(4)} │ ${statusText} │ ${details.padEnd(27)} │\n`,
    );
  };

  printRow("PostgreSQL", String(dbPort), pgUp, pgUp ? `Ready on 127.0.0.1:${dbPort}` : "Port closed");
  printRow("Redis", String(redisPort), redisUp, redisUp ? `Ready on 127.0.0.1:${redisPort}` : "Port closed");
  printRow(
    "AVANA API",
    String(apiPort),
    apiCheck.ok,
    apiCheck.ok ? `HTTP ${apiCheck.status || 200} OK` : "Offline (start via worker:start)",
  );
  printRow(
    "AVANA Web",
    String(webPort),
    webCheck.ok,
    webCheck.ok ? `HTTP ${webCheck.status || 200} OK` : "Offline (start via worker:start)",
  );

  process.stdout.write(`  └───────────────┴──────┴────────────┴─────────────────────────────┘\n\n`);

  // Docker Container details
  const projectName = `avana-worker-${workerId}`;
  const composePath = path.join(rootDir, "infra", "local", "compose.yaml");

  try {
    const dockerPs = execSync(
      `docker compose -f "${composePath}" -p "${projectName}" ps`,
      { encoding: "utf8", stdio: "pipe" },
    );
    if (dockerPs.trim().length > 0) {
      process.stdout.write(`${BOLD}Docker Containers (${projectName}):${RESET}\n`);
      for (const line of dockerPs.split("\n")) {
        if (line.trim()) process.stdout.write(`  ${line}\n`);
      }
      process.stdout.write("\n");
    }
  } catch {
    // Docker might be stopped
  }
}

main().catch((err) => {
  process.stderr.write(`Status check error: ${err.message}\n`);
  process.exit(1);
});
