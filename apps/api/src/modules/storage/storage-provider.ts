/**
 * Storage provider abstraction.
 *
 * Decouples file storage from the application so that the local filesystem
 * implementation can be swapped for S3/R2 (or any object store) later without
 * changing the documents module.
 *
 * The documents module stores only metadata in the database; actual file
 * contents are handled exclusively through this provider.
 */

export type StoredFile = {
  /** Unique storage key identifying the object (e.g. `docs/<uuid>.pdf`). */
  storageKey: string;
  /** Raw file bytes. */
  data: Buffer;
  /** MIME type of the stored object. */
  mimeType: string;
};

export type UploadIntent = {
  /** The storage key the client should upload to. */
  storageKey: string;
  /**
   * Pre-signed URL for direct-to-storage uploads.
   *
   * For the local filesystem provider no pre-signed URL exists, so this is
   * null and the client uploads via the API instead. S3/R2 providers will
   * populate this field.
   */
  uploadUrl: string | null;
  /** UTC ISO timestamp when the upload intent expires. */
  expiresAt: string;
};

export interface StorageProvider {
  /**
   * Begin an upload for a new object.
   *
   * Returns an intent describing how/where the client should upload. The
   * object is not yet persisted until `save()` is called (or the client
   * uploads to the returned URL).
   */
  createUpload(options: {
    storageKey: string;
    mimeType: string;
  }): Promise<UploadIntent>;

  /**
   * Persist a file at the given storage key.
   *
   * Used by the API when the client uploads through the API (local provider)
   * rather than directly to storage.
   */
  save(options: StoredFile): Promise<void>;

  /** Delete the object at the given storage key. No-op if it does not exist. */
  delete(storageKey: string): Promise<void>;

  /** Check whether an object exists at the given storage key. */
  exists(storageKey: string): Promise<boolean>;

  /** Read the object bytes at the given storage key. */
  read(storageKey: string): Promise<Buffer>;
}
