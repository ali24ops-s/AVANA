import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import type { BuildManifest, MigrationManifestEntry } from "./types.js";

/**
 * Computes canonical SHA-256 for a given string content.
 * Normalizes Windows CRLF to standard LF and trims leading/trailing whitespace.
 */
export function computeCanonicalSha256(content: string): string {
  const normalized = content.replace(/\r\n/g, "\n").trim();
  return crypto.createHash("sha256").update(normalized, "utf8").digest("hex");
}

/**
 * Computes canonical SHA-256 of a file on disk if it exists.
 */
export function computeFileSha256(filePath: string): string | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const content = fs.readFileSync(filePath, "utf8");
  return computeCanonicalSha256(content);
}

/**
 * Discovers package root or database root directory by walking up from a starting directory.
 */
function findPackageRoot(startDir: string): string | null {
  let curr = startDir;
  while (curr !== path.dirname(curr)) {
    if (
      fs.existsSync(path.join(curr, "package.json")) &&
      (fs.existsSync(path.join(curr, "migrations-manifest.json")) ||
        fs.existsSync(path.join(curr, "migrations")) ||
        fs.existsSync(path.join(curr, "dist", "migrations-manifest.json")))
    ) {
      return curr;
    }
    curr = path.dirname(curr);
  }
  return null;
}

/**
 * Resolves the candidate path of migrations-manifest.json.
 */
function findManifestPath(baseDir?: string): string | null {
  const candidates: string[] = [];

  if (baseDir) {
    candidates.push(
      path.join(baseDir, "dist", "migrations-manifest.json"),
      path.join(baseDir, "migrations-manifest.json"),
      path.join(baseDir, "database", "dist", "migrations-manifest.json"),
      path.join(baseDir, "database", "migrations-manifest.json")
    );
  }

  // Independent of process.cwd(): walk up from the current module location
  try {
    const currentFile = fileURLToPath(import.meta.url);
    const currentDir = path.dirname(currentFile);
    const pkgRoot = findPackageRoot(currentDir);
    if (pkgRoot) {
      candidates.push(
        path.join(pkgRoot, "dist", "migrations-manifest.json"),
        path.join(pkgRoot, "migrations-manifest.json")
      );
    }
    candidates.push(
      path.resolve(currentDir, "../dist/migrations-manifest.json"),
      path.resolve(currentDir, "../migrations-manifest.json"),
      path.resolve(currentDir, "../../dist/migrations-manifest.json"),
      path.resolve(currentDir, "../../migrations-manifest.json")
    );
  } catch {
    // Ignore if import.meta.url is not available
  }

  // Fallback checking process.cwd()
  const cwd = process.cwd();
  candidates.push(
    path.join(cwd, "dist", "migrations-manifest.json"),
    path.join(cwd, "migrations-manifest.json"),
    path.join(cwd, "database", "dist", "migrations-manifest.json"),
    path.join(cwd, "database", "migrations-manifest.json")
  );

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

/**
 * Loads the build manifest if available, otherwise generates an in-memory
 * manifest by inspecting available source / dist migration files.
 * Throws a clear error if neither the manifest nor migrations directory is found.
 */
export function resolveBuildManifest(baseDir?: string): BuildManifest {
  // If an explicit non-cwd baseDir is passed, verify candidate existence in that baseDir first
  const isCwdOrUnset = !baseDir || path.resolve(baseDir) === path.resolve(process.cwd());

  let targetPath: string | null = null;
  if (!isCwdOrUnset && baseDir) {
    const explicitCandidates = [
      path.join(baseDir, "dist", "migrations-manifest.json"),
      path.join(baseDir, "migrations-manifest.json"),
      path.join(baseDir, "database", "dist", "migrations-manifest.json"),
      path.join(baseDir, "database", "migrations-manifest.json"),
    ];
    for (const c of explicitCandidates) {
      if (fs.existsSync(c)) {
        targetPath = c;
        break;
      }
    }
  } else {
    targetPath = findManifestPath(baseDir);
  }

  if (targetPath) {
    try {
      const raw = fs.readFileSync(targetPath, "utf8");
      const parsed = JSON.parse(raw) as BuildManifest;
      if (Array.isArray(parsed.migrations) && parsed.migrations.length > 0) {
        return parsed;
      }
      throw new Error(`[MANIFEST_EMPTY] Manifest at "${targetPath}" contains 0 migrations.`);
    } catch (err: any) {
      if (err.message?.startsWith("[MANIFEST_")) {
        throw err;
      }
      // eslint-disable-next-line no-console
      console.warn(`[WARN] Failed to parse manifest at ${targetPath}:`, err?.message ?? err);
    }
  }

  // Fallback: Scan migrations directory (development or pre-manifest environment)
  const candidateScanDirs: string[] = [];
  if (baseDir) {
    candidateScanDirs.push(
      path.join(baseDir, "migrations"),
      path.join(baseDir, "dist", "migrations"),
      path.join(baseDir, "database", "migrations"),
      path.join(baseDir, "database", "dist", "migrations")
    );
  }

  if (isCwdOrUnset) {
    try {
      const currentDir = path.dirname(fileURLToPath(import.meta.url));
      const pkgRoot = findPackageRoot(currentDir);
      if (pkgRoot) {
        candidateScanDirs.push(
          path.join(pkgRoot, "migrations"),
          path.join(pkgRoot, "dist", "migrations")
        );
      }
      candidateScanDirs.push(
        path.resolve(currentDir, "../migrations"),
        path.resolve(currentDir, "../dist/migrations"),
        path.resolve(currentDir, "../../migrations"),
        path.resolve(currentDir, "../../dist/migrations")
      );
    } catch {
      // Ignore
    }

    const cwd = process.cwd();
    candidateScanDirs.push(
      path.join(cwd, "migrations"),
      path.join(cwd, "dist", "migrations"),
      path.join(cwd, "database", "migrations"),
      path.join(cwd, "database", "dist", "migrations")
    );
  }

  let scanDir: string | null = null;
  for (const dir of candidateScanDirs) {
    if (dir && fs.existsSync(dir)) {
      scanDir = dir;
      break;
    }
  }

  const entries: MigrationManifestEntry[] = [];
  if (scanDir && fs.existsSync(scanDir)) {
    const files = fs
      .readdirSync(scanDir)
      .filter((f) => f.endsWith(".ts") || f.endsWith(".js"))
      .sort();

    const seenIds = new Set<string>();

    for (const f of files) {
      const id = f.replace(/\.(ts|js)$/, "");
      if (seenIds.has(id)) continue;
      seenIds.add(id);

      const seqMatch = id.match(/^(\d+)_/);
      const sequence = seqMatch ? parseInt(seqMatch[1], 10) : 0;
      const tsPath = path.join(scanDir, `${id}.ts`);
      const jsPath = path.join(scanDir, `${id}.js`);

      const sourceHash = computeFileSha256(tsPath) ?? computeFileSha256(jsPath) ?? "0".repeat(64);
      const distHash = computeFileSha256(jsPath) ?? undefined;

      entries.push({
        id,
        sequence,
        source_file: `${id}.ts`,
        dist_file: `${id}.js`,
        source_sha256: sourceHash,
        dist_sha256: distHash,
      });
    }
  }

  if (entries.length > 0) {
    return {
      build_timestamp: new Date().toISOString(),
      migrations: entries,
    };
  }

  throw new Error(
    `[MANIFEST_NOT_FOUND] Could not locate migrations-manifest.json or migrations directory. ` +
    `Searched baseDir: "${baseDir ?? "(none)"}", cwd: "${process.cwd()}".`
  );
}
