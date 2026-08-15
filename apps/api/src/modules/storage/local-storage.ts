/**
 * Local filesystem implementation of StorageProvider.
 *
 * Stores uploaded files under a configurable base directory. This is intended
 * for development and single-node deployments. S3/R2 can be added later behind
 * the same StorageProvider interface.
 *
 * Security: storage keys are treated as opaque relative paths. The provider
 * resolves them only within the configured base directory to prevent
 * path-traversal escapes.
 */

import fs from "node:fs/promises";
import path from "node:path";
import type {
  StorageProvider,
  StoredFile,
  UploadIntent,
} from "./storage-provider.js";

export class LocalStorageProvider implements StorageProvider {
  constructor(
    private readonly baseDirectory: string,
    private readonly uploadExpiryMs: number = 15 * 60 * 1000, // 15 minutes
  ) {}

  /**
   * Resolve a storage key to an absolute path, guarding against traversal.
   */
  private resolvePath(storageKey: string): string {
    const base = path.resolve(this.baseDirectory);
    const resolved = path.resolve(base, storageKey);
    if (resolved !== base && !resolved.startsWith(base + path.sep)) {
      throw new Error(`Invalid storage key: ${storageKey}`);
    }
    return resolved;
  }

  async createUpload(options: {
    storageKey: string;
    mimeType: string;
  }): Promise<UploadIntent> {
    // Local provider has no pre-signed URL — the client uploads via the API.
    return {
      storageKey: options.storageKey,
      uploadUrl: null,
      expiresAt: new Date(Date.now() + this.uploadExpiryMs).toISOString(),
    };
  }

  async save(options: StoredFile): Promise<void> {
    const filePath = this.resolvePath(options.storageKey);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, options.data);
  }

  async delete(storageKey: string): Promise<void> {
    const filePath = this.resolvePath(storageKey);
    try {
      await fs.unlink(filePath);
    } catch (err) {
      // Treat missing files as already-deleted (idempotent delete).
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        throw err;
      }
    }
  }

  async exists(storageKey: string): Promise<boolean> {
    const filePath = this.resolvePath(storageKey);
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async read(storageKey: string): Promise<Buffer> {
    const filePath = this.resolvePath(storageKey);
    return fs.readFile(filePath);
  }
}
