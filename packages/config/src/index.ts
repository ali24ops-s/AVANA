/**
 * Centralized Configuration & Environment Loader for AVANA Monorepo.
 */

import fs from "node:fs";
import path from "node:path";

let hasLoadedEnv = false;

/**
 * Finds the monorepo root directory by ascending up the file tree looking for
 * the root package.json (containing workspaces or name "avana").
 */
export function findMonorepoRoot(startDir: string = process.cwd()): string {
  let current = path.resolve(startDir);
  while (true) {
    const pkgPath = path.join(current, "package.json");
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as {
          workspaces?: unknown;
          name?: string;
        };
        if (pkg.workspaces || pkg.name === "avana") {
          return current;
        }
      } catch {
        // continue ascending if package.json cannot be parsed
      }
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return path.resolve(startDir);
}

/**
 * Options for loading monorepo environment files.
 */
export interface LoadEnvOptions {
  /** Explicit path to .env file (defaults to root .env) */
  envPath?: string;
  /** Force reloading even if previously loaded */
  force?: boolean;
}

/**
 * Loads environment variables from the root `.env` file into `process.env`.
 *
 * Rules:
 * - Does NOT overwrite variables already defined in `process.env`.
 * - Safe if `.env` does not exist (e.g., in CI or production container environments).
 * - Safe to call multiple times (idempotent).
 */
export function loadMonorepoEnv(options?: LoadEnvOptions): void {
  if (hasLoadedEnv && !options?.force) {
    return;
  }

  const root = findMonorepoRoot();
  const envFile = options?.envPath ? path.resolve(options.envPath) : path.join(root, ".env");

  if (!fs.existsSync(envFile)) {
    hasLoadedEnv = true;
    return;
  }

  if (typeof process.loadEnvFile === "function") {
    try {
      process.loadEnvFile(envFile);
    } catch (err: unknown) {
      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code: string }).code === "ENOENT"
      ) {
        // Ignore missing file
      } else {
        throw err;
      }
    }
  } else {
    // Fallback parser if process.loadEnvFile is unavailable
    const content = fs.readFileSync(envFile, "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env)) {
        process.env[key] = val;
      }
    }
  }

  hasLoadedEnv = true;
}
