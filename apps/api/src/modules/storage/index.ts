/**
 * Storage module — Public API.
 *
 * Exposes the StorageProvider abstraction and the local filesystem
 * implementation for use by the documents module and composition roots.
 */

export type {
  StorageProvider,
  StoredFile,
  UploadIntent,
} from "./storage-provider.js";
export { LocalStorageProvider } from "./local-storage.js";
