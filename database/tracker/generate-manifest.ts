/* eslint-disable no-console */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { computeFileSha256 } from "./checksum.js";
import type { BuildManifest, MigrationManifestEntry } from "./types.js";

function findPackageRoot(startDir: string): string {
  let curr = startDir;
  while (curr !== path.dirname(curr)) {
    if (fs.existsSync(path.join(curr, "package.json")) && fs.existsSync(path.join(curr, "migrations"))) {
      return curr;
    }
    curr = path.dirname(curr);
  }
  return path.resolve(startDir, "..");
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const databaseDir = findPackageRoot(__dirname);

export function generateManifest(): BuildManifest {
  const migrationsDir = path.join(databaseDir, "migrations");
  const distMigrationsDir = path.join(databaseDir, "dist", "migrations");

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".ts"))
    .sort();

  const entries: MigrationManifestEntry[] = [];

  for (const f of files) {
    const id = f.replace(/\.ts$/, "");
    const seqMatch = id.match(/^(\d+)_/);
    const sequence = seqMatch ? parseInt(seqMatch[1], 10) : 0;
    const tsPath = path.join(migrationsDir, f);
    const jsPath = path.join(distMigrationsDir, `${id}.js`);

    const sourceHash = computeFileSha256(tsPath) ?? "0".repeat(64);
    const distHash = computeFileSha256(jsPath) ?? undefined;

    entries.push({
      id,
      sequence,
      source_file: f,
      dist_file: `${id}.js`,
      source_sha256: sourceHash,
      dist_sha256: distHash,
    });
  }

  const manifest: BuildManifest = {
    build_timestamp: new Date().toISOString(),
    migrations: entries,
  };

  const manifestPath = path.join(databaseDir, "migrations-manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`Generated build manifest at ${manifestPath} (${entries.length} migrations)`);

  const distDir = path.join(databaseDir, "dist");
  if (fs.existsSync(distDir)) {
    const distManifestPath = path.join(distDir, "migrations-manifest.json");
    fs.writeFileSync(distManifestPath, JSON.stringify(manifest, null, 2) + "\n");
    console.log(`Synced build manifest to ${distManifestPath}`);
  }

  return manifest;
}

// Direct CLI execution
if (process.argv[1] === __filename) {
  generateManifest();
}
