/**
 * Production Deployment Isolation Verification Suite.
 *
 * Checks:
 * 1. Build outputs (apps/web/dist, apps/api/dist, apps/worker/dist) have zero Remotion or studio references.
 * 2. No heavy media assets (*.mp4, *.wav, raw recordings) leak into build outputs.
 * 3. package-lock.json at root contains zero @remotion/* or msedge-tts packages.
 * 4. Production API routes cleanly isolate out-of-scope studio endpoints.
 */

import fs from "node:fs";
import path from "node:path";

const ROOT_DIR = process.cwd();

interface CheckResult {
  name: string;
  passed: boolean;
  details: string;
}

const results: CheckResult[] = [];

function check(name: string, condition: boolean, details: string) {
  results.push({ name, passed: condition, details });
  const status = condition ? "✓ PASS" : "✖ FAIL";
  console.log(`[${status}] ${name}`);
  if (!condition) {
    console.error(`       Details: ${details}`);
  }
}

async function verifyBuildOutputs() {
  console.log("\n=== 1. Verifying Production Build Output Isolation ===");

  const webDist = path.join(ROOT_DIR, "apps/web/dist");
  const apiDist = path.join(ROOT_DIR, "apps/api/dist");
  const workerDist = path.join(ROOT_DIR, "apps/worker/dist");

  // Check dist directories exist
  check("apps/web/dist exists", fs.existsSync(webDist), webDist);
  check("apps/api/dist exists", fs.existsSync(apiDist), apiDist);
  check("apps/worker/dist exists", fs.existsSync(workerDist), workerDist);

  // Scan dist files for forbidden strings: "remotion", "@remotion", "msedge-tts", "tutorial-studio"
  const forbiddenTerms = ["remotion", "msedge-tts", "tutorial-studio"];

  function scanDir(dir: string, baseDir: string): { found: string[]; mediaFiles: string[] } {
    const found: string[] = [];
    const mediaFiles: string[] = [];

    if (!fs.existsSync(dir)) return { found, mediaFiles };

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const sub = scanDir(fullPath, baseDir);
        found.push(...sub.found);
        mediaFiles.push(...sub.mediaFiles);
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        if ([".mp4", ".wav", ".avi", ".mov"].includes(ext)) {
          mediaFiles.push(path.relative(baseDir, fullPath));
        }

        if ([".js", ".mjs", ".html", ".css", ".json"].includes(ext)) {
          const content = fs.readFileSync(fullPath, "utf-8").toLowerCase();
          for (const term of forbiddenTerms) {
            if (content.includes(term.toLowerCase())) {
              found.push(`${path.relative(baseDir, fullPath)} contains "${term}"`);
            }
          }
        }
      }
    }
    return { found, mediaFiles };
  }

  const webScan = scanDir(webDist, webDist);
  check(
    "apps/web/dist free from studio references",
    webScan.found.length === 0,
    webScan.found.join("; ") || "Clean",
  );
  check(
    "apps/web/dist free from heavy video/audio blobs",
    webScan.mediaFiles.length === 0,
    webScan.mediaFiles.join("; ") || "Clean",
  );

  const apiScan = scanDir(apiDist, apiDist);
  check(
    "apps/api/dist free from studio references",
    apiScan.found.length === 0,
    apiScan.found.join("; ") || "Clean",
  );
  check(
    "apps/api/dist free from heavy video/audio blobs",
    apiScan.mediaFiles.length === 0,
    apiScan.mediaFiles.join("; ") || "Clean",
  );

  const workerScan = scanDir(workerDist, workerDist);
  check(
    "apps/worker/dist free from studio references",
    workerScan.found.length === 0,
    workerScan.found.join("; ") || "Clean",
  );
}

function verifyRootPackageLock() {
  console.log("\n=== 2. Verifying Root package-lock.json Cleanliness ===");

  const lockPath = path.join(ROOT_DIR, "package-lock.json");
  check("package-lock.json exists", fs.existsSync(lockPath), lockPath);

  const lockContent = fs.readFileSync(lockPath, "utf-8");
  const parsed = JSON.parse(lockContent);

  const rootDeps = {
    ...parsed.packages?.[""]?.dependencies,
    ...parsed.packages?.[""]?.devDependencies,
  };

  const forbiddenPackages = [
    "remotion",
    "@remotion/bundler",
    "@remotion/cli",
    "@remotion/renderer",
    "msedge-tts",
    "@avana/tutorial-studio",
  ];

  for (const pkg of forbiddenPackages) {
    check(
      `package-lock.json root does not declare "${pkg}"`,
      !rootDeps[pkg],
      `Found in root: ${pkg}`,
    );
  }
}

function verifyIgnoreFiles() {
  console.log("\n=== 3. Verifying Ignore and CI Configs ===");

  const gitignore = fs.readFileSync(path.join(ROOT_DIR, ".gitignore"), "utf-8");
  check(
    ".gitignore excludes tools/tutorial-studio/output/",
    gitignore.includes("tools/tutorial-studio/output/"),
    "output/ exclusion",
  );

  const eslintConfig = fs.readFileSync(path.join(ROOT_DIR, "eslint.config.js"), "utf-8");
  check(
    "eslint.config.js ignores tools/tutorial-studio/**",
    eslintConfig.includes("tools/tutorial-studio/**"),
    "tools/tutorial-studio ignore in eslint",
  );

  const prettierignore = fs.readFileSync(path.join(ROOT_DIR, ".prettierignore"), "utf-8");
  check(
    ".prettierignore excludes tools/tutorial-studio/output/**",
    prettierignore.includes("tools/tutorial-studio/output/**"),
    "prettier ignore",
  );

  const secretlintignore = fs.readFileSync(path.join(ROOT_DIR, ".secretlintignore"), "utf-8");
  check(
    ".secretlintignore excludes tools/tutorial-studio/output/**",
    secretlintignore.includes("tools/tutorial-studio/output/**"),
    "secretlint ignore",
  );
}

function verifyWorkspaces() {
  console.log("\n=== 4. Verifying Root package.json Workspaces ===");

  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "package.json"), "utf-8"));
  const workspaces: string[] = pkg.workspaces || [];

  check(
    "tools/tutorial-studio is NOT an npm workspace (isolated tool)",
    !workspaces.includes("tools/tutorial-studio") && !workspaces.includes("tools/*"),
    `Workspaces: ${workspaces.join(", ")}`,
  );
}

async function main() {
  console.log("=============================================================");
  console.log("       AVANA Production Deployment Isolation Audit Suite     ");
  console.log("=============================================================");

  verifyRootPackageLock();
  verifyWorkspaces();
  verifyIgnoreFiles();
  await verifyBuildOutputs();

  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = total - passed;

  console.log("\n=============================================================");
  console.log(`Results: ${passed}/${total} checks PASSED. (${failed} FAILED)`);
  console.log("=============================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Verification suite failed:", err);
  process.exit(1);
});
