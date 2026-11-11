import fs from "fs";
import path from "path";
import crypto from "crypto";
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
 * Loads the build manifest if available, otherwise generates an in-memory
 * manifest by inspecting available source / dist migration files.
 */
export function resolveBuildManifest(baseDir: string): BuildManifest {
  const manifestPath = path.join(baseDir, "migrations-manifest.json");
  const distManifestPath = path.join(baseDir, "dist", "migrations-manifest.json");

  const targetPath = fs.existsSync(distManifestPath)
    ? distManifestPath
    : fs.existsSync(manifestPath)
    ? manifestPath
    : null;

  if (targetPath) {
    try {
      const raw = fs.readFileSync(targetPath, "utf8");
      return JSON.parse(raw) as BuildManifest;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[WARN] Failed to parse manifest at ${targetPath}:`, err);
    }
  }

  // Fallback: Scan migrations directory (development or pre-manifest environment)
  const migrationsDir = path.join(baseDir, "migrations");
  const distMigrationsDir = path.join(baseDir, "dist", "migrations");
  const hasTs = fs.existsSync(migrationsDir);
  const scanDir = hasTs ? migrationsDir : distMigrationsDir;

  const entries: MigrationManifestEntry[] = [];
  if (fs.existsSync(scanDir)) {
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
      const tsPath = path.join(migrationsDir, `${id}.ts`);
      const jsPath = path.join(distMigrationsDir, `${id}.js`);

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

  return {
    build_timestamp: new Date().toISOString(),
    migrations: entries,
  };
}
