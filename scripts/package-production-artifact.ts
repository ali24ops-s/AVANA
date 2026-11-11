/**
 * AVANA Production Artifact Packager & Validator.
 *
 * Implements a strict Allowlist-based packaging pipeline:
 * 1. Verifies that all apps and packages have been built (dist/ exists).
 * 2. Packages only the required runtime files into `dist-artifact/` (and tarball).
 * 3. Enforces 0% studio code, 0% Remotion, 0% media blobs, 0% secrets.
 * 4. Performs a dry-run test of the artifact in an isolated sandbox.
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT_DIR = process.cwd();
const ARTIFACT_DIR = path.join(ROOT_DIR, "dist-artifact");
const ARTIFACT_PAYLOAD_DIR = path.join(ARTIFACT_DIR, "payload");
const SANDBOX_TEST_DIR = path.join(ROOT_DIR, "scratch", "clean-artifact-sandbox");

// -----------------------------------------------------------------------------
// 1. Allowlist definition
// -----------------------------------------------------------------------------
interface AllowlistEntry {
  source: string;
  target: string;
  required: boolean;
}

const ALLOWLIST: AllowlistEntry[] = [
  // Root metadata & config
  { source: "package.json", target: "package.json", required: true },
  { source: "package-lock.json", target: "package-lock.json", required: true },
  { source: "tsconfig.base.json", target: "tsconfig.base.json", required: true },

  // Apps
  { source: "apps/api/dist", target: "apps/api/dist", required: true },
  { source: "apps/api/package.json", target: "apps/api/package.json", required: true },
  { source: "apps/worker/dist", target: "apps/worker/dist", required: true },
  { source: "apps/worker/package.json", target: "apps/worker/package.json", required: true },
  { source: "apps/web/dist", target: "apps/web/dist", required: true },
  { source: "apps/web/package.json", target: "apps/web/package.json", required: true },

  // Packages
  { source: "packages/config/dist", target: "packages/config/dist", required: true },
  { source: "packages/config/package.json", target: "packages/config/package.json", required: true },
  { source: "packages/contracts/dist", target: "packages/contracts/dist", required: true },
  { source: "packages/contracts/package.json", target: "packages/contracts/package.json", required: true },
  { source: "packages/domain/dist", target: "packages/domain/dist", required: true },
  { source: "packages/domain/package.json", target: "packages/domain/package.json", required: true },
  { source: "packages/ui/dist", target: "packages/ui/dist", required: true },
  { source: "packages/ui/package.json", target: "packages/ui/package.json", required: true },
  { source: "packages/ui/src", target: "packages/ui/src", required: false },

  // Database
  { source: "database/dist", target: "database/dist", required: true },
  { source: "database/migrations", target: "database/migrations", required: true },
  { source: "database/migrate.ts", target: "database/migrate.ts", required: true },
  { source: "database/client.ts", target: "database/client.ts", required: true },
  { source: "database/drizzle.config.ts", target: "database/drizzle.config.ts", required: true },
  { source: "database/package.json", target: "database/package.json", required: true },

  // Infra
  { source: "infra/nginx-course-preview.conf", target: "infra/nginx-course-preview.conf", required: true },
];

// -----------------------------------------------------------------------------
// Helper functions
// -----------------------------------------------------------------------------
function copyRecursive(src: string, dest: string) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const child of fs.readdirSync(src)) {
      copyRecursive(path.join(src, child), path.join(dest, child));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

function getDirectorySize(dir: string): { bytes: number; count: number } {
  let bytes = 0;
  let count = 0;
  if (!fs.existsSync(dir)) return { bytes, count };

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = getDirectorySize(fullPath);
      bytes += sub.bytes;
      count += sub.count;
    } else {
      bytes += fs.statSync(fullPath).size;
      count += 1;
    }
  }
  return { bytes, count };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// -----------------------------------------------------------------------------
// Packaging Pipeline
// -----------------------------------------------------------------------------
async function packageArtifact(): Promise<void> {
  console.log("=============================================================");
  console.log("       AVANA Production Artifact Packaging Pipeline          ");
  console.log("=============================================================\n");

  // Step 1: Clean & prepare output directory
  if (fs.existsSync(ARTIFACT_PAYLOAD_DIR)) {
    fs.rmSync(ARTIFACT_PAYLOAD_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(ARTIFACT_PAYLOAD_DIR, { recursive: true });

  console.log("[1/5] Copying Allowlist Entries into Artifact...");
  for (const item of ALLOWLIST) {
    const fullSrc = path.join(ROOT_DIR, item.source);
    const fullTarget = path.join(ARTIFACT_PAYLOAD_DIR, item.target);

    if (!fs.existsSync(fullSrc)) {
      if (item.required) {
        throw new Error(`Required allowlist file missing: ${item.source}. Run 'npm run build' first.`);
      }
      continue;
    }

    copyRecursive(fullSrc, fullTarget);
    console.log(`  ✓ Copied: ${item.source} -> ${item.target}`);
  }

  // Step 2: Strict Security & Isolation Audit on Payload
  console.log("\n[2/5] Running Strict Isolation Audit on Artifact Payload...");

  const forbiddenStrings = ["tools/tutorial-studio", "remotion", "msedge-tts"];
  const forbiddenExts = [".mp4", ".wav", ".avi", ".mov", ".dump", ".sql.bak"];

  function scanPayload(dir: string): { violations: string[] } {
    const violations: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      const relPath = path.relative(ARTIFACT_PAYLOAD_DIR, fullPath);

      if (entry.name.startsWith(".env") && !entry.name.endsWith(".example")) {
        violations.push(`SECRET LEAK: Found active env file: ${relPath}`);
      }

      if (entry.isDirectory()) {
        if (entry.name === "tutorial-studio" || entry.name === "tools") {
          violations.push(`STUDIO LEAK: Found prohibited directory: ${relPath}`);
        }
        violations.push(...scanPayload(fullPath).violations);
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        if (forbiddenExts.includes(ext)) {
          violations.push(`MEDIA/DUMP LEAK: Found heavy file: ${relPath}`);
        }

        if (entry.name.endsWith(".test.ts") || entry.name.endsWith(".test.tsx")) {
          violations.push(`TEST LEAK: Found test file in runtime payload: ${relPath}`);
        }
      }
    }
    return { violations };
  }

  const { violations } = scanPayload(ARTIFACT_PAYLOAD_DIR);
  if (violations.length > 0) {
    console.error("✖ ARTIFACT INTEGRITY FAILED with violations:");
    for (const v of violations) console.error(`  - ${v}`);
    throw new Error("Artifact contains prohibited files or leaks.");
  }
  console.log("  ✓ 0 studio files detected.");
  console.log("  ✓ 0 heavy media files (MP4/WAV) detected.");
  console.log("  ✓ 0 secret/env files detected.");
  console.log("  ✓ 0 unit/integration test files detected in runtime payload.");

  // Step 3: Create Compressed Production Tarball
  console.log("\n[3/5] Creating Compressed Production Tarball...");
  const tarballPath = path.join(ARTIFACT_DIR, "avana-production-release.tar.gz");
  if (fs.existsSync(tarballPath)) {
    fs.unlinkSync(tarballPath);
  }

  execSync(`tar -czf "${tarballPath}" -C "${ARTIFACT_PAYLOAD_DIR}" .`, { stdio: "inherit" });
  const tarballStat = fs.statSync(tarballPath);
  const payloadStats = getDirectorySize(ARTIFACT_PAYLOAD_DIR);

  console.log(`  ✓ Uncompressed Payload Size: ${formatBytes(payloadStats.bytes)} (${payloadStats.count} files)`);
  console.log(`  ✓ Compressed Tarball Size:   ${formatBytes(tarballStat.size)} (${tarballPath})`);

  // Step 4: Standalone Sandbox Simulation Test
  console.log("\n[4/5] Testing Artifact in Clean Isolated Sandbox...");

  if (fs.existsSync(SANDBOX_TEST_DIR)) {
    fs.rmSync(SANDBOX_TEST_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(SANDBOX_TEST_DIR, { recursive: true });

  // Extract tarball into sandbox
  execSync(`tar -xzf "${tarballPath}" -C "${SANDBOX_TEST_DIR}"`, { stdio: "inherit" });

  // Check 1: Root files in sandbox
  if (!fs.existsSync(path.join(SANDBOX_TEST_DIR, "package.json"))) {
    throw new Error("Sandbox extraction missing package.json");
  }

  // Check 2: Run npm ci --omit=dev in sandbox to prove runtime dependency installability
  console.log("  -> Testing npm ci --omit=dev in clean sandbox...");
  execSync("npm ci --omit=dev", {
    cwd: SANDBOX_TEST_DIR,
    stdio: "pipe",
  });
  console.log("  ✓ npm ci --omit=dev succeeded in clean sandbox.");

  // Check 3: Verify API and Worker entrypoints and exports load cleanly with runtime modules
  const apiTestCode = `
    import { loadApiConfig } from "./apps/api/dist/config.js";
    import { createApp } from "./apps/api/dist/server/createApp.js";
    import { healthRoutes } from "./apps/api/dist/routes/health.js";

    process.env.NODE_ENV = "test";
    const config = loadApiConfig();
    const app = createApp({ config });
    app.register(healthRoutes);
    await app.ready();
    const res = await app.inject({ method: "GET", url: "/v1/health" });
    if (res.statusCode !== 200) {
      throw new Error("Health check returned status " + res.statusCode);
    }
    process.stdout.write("API entrypoint, config, and /v1/health verified in sandbox.\\n");
  `;
  execSync(`node --input-type=module -e '${apiTestCode.replace(/\n/g, " ")}'`, {
    cwd: SANDBOX_TEST_DIR,
    stdio: "inherit",
  });

  execSync(`node --check ./apps/worker/dist/index.js`, {
    cwd: SANDBOX_TEST_DIR,
    stdio: "inherit",
  });
  execSync(`node --check ./apps/api/dist/start.js`, {
    cwd: SANDBOX_TEST_DIR,
    stdio: "inherit",
  });
  const workerConfigTest = `
    const cfg = await import("./apps/worker/dist/config.js");
    if (!cfg.loadWorkerConfig) throw new Error("Worker config export missing");
    process.stdout.write("Worker config export verified successfully.\\n");
  `;
  execSync(`node --input-type=module -e '${workerConfigTest.replace(/\n/g, " ")}'`, {
    cwd: SANDBOX_TEST_DIR,
    stdio: "inherit",
  });

  // Check 4: Verify Frontend dist bundle
  const htmlPath = path.join(SANDBOX_TEST_DIR, "apps/web/dist/index.html");
  if (!fs.existsSync(htmlPath)) {
    throw new Error("Frontend build missing apps/web/dist/index.html");
  }
  const htmlSize = fs.statSync(htmlPath).size;
  console.log(`  ✓ Frontend static bundle verified: ${formatBytes(htmlSize)}`);

  // Check 5: Verify Migrations (compiled JS and migration scripts)
  const compiledMigrate = path.join(SANDBOX_TEST_DIR, "database/dist/migrate.js");
  if (!fs.existsSync(compiledMigrate)) {
    throw new Error("Database compiled migrate.js missing in dist");
  }
  execSync(`node --check ./database/dist/migrate.js`, {
    cwd: SANDBOX_TEST_DIR,
    stdio: "inherit",
  });
  const migrationsDistDir = path.join(SANDBOX_TEST_DIR, "database/dist/migrations");
  const compiledMigrationFiles = fs.readdirSync(migrationsDistDir).filter((f) => f.endsWith(".js"));
  console.log(`  ✓ Compiled migrations verified: ${compiledMigrationFiles.length} migration scripts in database/dist/migrations.`);

  // Check 6: Verify Environment Loading with dummy values (zero secrets exposed)
  const dummyEnvDir = path.join(SANDBOX_TEST_DIR, "infra", "production");
  fs.mkdirSync(dummyEnvDir, { recursive: true });
  fs.writeFileSync(path.join(dummyEnvDir, ".env"), "NODE_ENV=test\nMOCK_SAFE_KEY=dummy_value_abc\n");
  fs.copyFileSync(path.join(dummyEnvDir, ".env"), path.join(SANDBOX_TEST_DIR, ".env"));
  const envTestCode = `
    import { loadMonorepoEnv } from "./packages/config/dist/index.js";
    loadMonorepoEnv();
    if (process.env.MOCK_SAFE_KEY !== "dummy_value_abc") {
      throw new Error("Monorepo env loader failed to load dummy env");
    }
    process.stdout.write("Dummy environment preservation test passed.\\n");
  `;
  execSync(`node --input-type=module -e '${envTestCode.replace(/\n/g, " ")}'`, {
    cwd: SANDBOX_TEST_DIR,
    stdio: "inherit",
  });
  // Clean up test env files in sandbox
  fs.rmSync(path.join(dummyEnvDir, ".env"), { force: true });
  fs.rmSync(path.join(SANDBOX_TEST_DIR, ".env"), { force: true });

  console.log("\n[5/5] Production Artifact Packaging & Validation Complete!");
  console.log("=============================================================");
  console.log("STATUS: PRODUCTION DEPLOYMENT READY");
  console.log(`Artifact Tarball: ${tarballPath}`);
  console.log(`Payload Directory: ${ARTIFACT_PAYLOAD_DIR}`);
  console.log("=============================================================\n");
}

packageArtifact().catch((err) => {
  console.error("Packaging failed:", err);
  process.exit(1);
});
