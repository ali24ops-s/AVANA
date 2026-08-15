/**
 * PR6-2 tests for LocalStorageProvider.
 *
 * Covers the storage provider abstraction contract:
 * - createUpload returns intent with a storage key
 * - save/read round-trips file bytes
 * - exists reports presence/absence
 * - delete is idempotent
 * - path-traversal storage keys are rejected
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { LocalStorageProvider } from "./local-storage.js";

describe("LocalStorageProvider", () => {
  let baseDir: string;
  let provider: LocalStorageProvider;

  beforeEach(async () => {
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "avana-storage-test-"));
    provider = new LocalStorageProvider(baseDir);
  });

  afterEach(async () => {
    await fs.rm(baseDir, { recursive: true, force: true });
  });

  it("createUpload returns an upload intent with a storage key", async () => {
    const intent = await provider.createUpload({
      storageKey: "uploads/abc.pdf",
      mimeType: "application/pdf",
    });

    expect(intent.storageKey).toBe("uploads/abc.pdf");
    expect(intent.uploadUrl).toBeNull();
    expect(intent.expiresAt).toBeDefined();
    expect(new Date(intent.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("save then read round-trips the file bytes", async () => {
    const data = Buffer.from("%PDF-1.4 fake pdf content");
    await provider.save({
      storageKey: "uploads/doc.pdf",
      data,
      mimeType: "application/pdf",
    });

    const read = await provider.read("uploads/doc.pdf");
    expect(read.equals(data)).toBe(true);
  });

  it("exists reports true for saved files and false for missing ones", async () => {
    await provider.save({
      storageKey: "uploads/doc.pdf",
      data: Buffer.from("x"),
      mimeType: "application/pdf",
    });

    expect(await provider.exists("uploads/doc.pdf")).toBe(true);
    expect(await provider.exists("uploads/missing.pdf")).toBe(false);
  });

  it("delete removes the file and is idempotent", async () => {
    await provider.save({
      storageKey: "uploads/doc.pdf",
      data: Buffer.from("x"),
      mimeType: "application/pdf",
    });
    expect(await provider.exists("uploads/doc.pdf")).toBe(true);

    await provider.delete("uploads/doc.pdf");
    expect(await provider.exists("uploads/doc.pdf")).toBe(false);

    // Deleting again should not throw.
    await expect(provider.delete("uploads/doc.pdf")).resolves.toBeUndefined();
  });

  it("rejects path-traversal storage keys", async () => {
    await expect(
      provider.save({
        storageKey: "../escape.txt",
        data: Buffer.from("x"),
        mimeType: "text/plain",
      }),
    ).rejects.toThrow("Invalid storage key");
  });
});
